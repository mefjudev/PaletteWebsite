'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, getDocsFromServer, getDocsFromCache, onSnapshot, doc, deleteDoc, updateDoc, getDoc, setDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import ImageUpload from '@/components/ImageUpload';
import MaterialSchedule from '@/components/MaterialSchedule';
import { BIMItem } from '@/lib/types/bim';
import { Loader2, Save, Trash2, FileUp, Share2, UserPlus, X, Users } from 'lucide-react';
import * as XLSX from 'xlsx';

interface SavedProject {
  id: string;
  name: string;
  materials: BIMItem[];
  createdAt: any;
  userId: string;
  sharedWith?: string[]; // Array of user IDs who have read-only access
  sharedWithEmails?: string[]; // Array of email addresses for display
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [materials, setMaterials] = useState<BIMItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [pendingMaterials, setPendingMaterials] = useState<BIMItem[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sharedProjects, setSharedProjects] = useState<SavedProject[]>([]);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareProjectId, setShareProjectId] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const unsubscribeSharedRef = useRef<(() => void) | null>(null);
  const isSettingUpRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push('/');
      } else {
        setUser(currentUser);
        
        // Ensure user record exists in Firestore for sharing functionality
        // Use setDoc with merge to avoid read-then-write (more reliable)
        const ensureUserRecord = async (retries = 2) => {
          try {
            const userDocRef = doc(db, 'users', currentUser.uid);
            // Use setDoc with merge - it will create if doesn't exist, update if it does
            // Use serverTimestamp() instead of new Date() to avoid invalid-argument errors
            await setDoc(userDocRef, {
              email: currentUser.email?.toLowerCase() || '',
              uid: currentUser.uid,
              createdAt: serverTimestamp()
            }, { merge: true });
            console.log('✅ User record ensured successfully');
          } catch (error: any) {
            // If it's a network error and we have retries left, try again
            if ((error?.code === 'unavailable' || error?.code === 'deadline-exceeded') && retries > 0) {
              console.warn(`⚠️ Retrying user record creation (${retries} retries left)...`);
              setTimeout(() => ensureUserRecord(retries - 1), 2000);
            } else {
              console.warn('⚠️ Could not ensure user record exists (non-critical):', error?.code || error?.message);
              // Continue even if user record creation fails - not critical for app functionality
            }
          }
        };
        
        // Delay slightly to let Firebase connect first
        setTimeout(() => ensureUserRecord(), 500);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    
    console.log('Setting up project listener for user:', user.uid);
    console.log('Firestore instance:', db.app.name, 'Project ID:', db.app.options.projectId);
    
    // Log Firebase config to verify it's correct (without sensitive data)
    console.log('🔍 Firebase Config Check:', {
      projectId: db.app.options.projectId,
      authDomain: db.app.options.authDomain,
      apiKey: db.app.options.apiKey ? `${db.app.options.apiKey.substring(0, 10)}...` : 'missing',
      appId: db.app.options.appId ? `${db.app.options.appId.substring(0, 10)}...` : 'missing'
    });
    
    // Prevent concurrent setup
    if (isSettingUpRef.current) {
      console.log('⚠️ Already setting up listeners, skipping...');
      return;
    }
    isSettingUpRef.current = true;
    
    // Clean up any existing listeners first and wait for cleanup to complete
    const setupListeners = async () => {
      // Clean up existing listeners
      if (unsubscribeRef.current) {
        console.log('🧹 Cleaning up existing projects listener...');
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (unsubscribeSharedRef.current) {
        console.log('🧹 Cleaning up existing shared projects listener...');
        unsubscribeSharedRef.current();
        unsubscribeSharedRef.current = null;
      }
      
      // CRITICAL: Wait for Firestore to fully clean up the old listeners
      // Firestore needs time to remove the old target IDs before we can create new ones
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // CRITICAL: Wait for Firestore network to be enabled before doing ANY queries
      // On Vercel, Firestore might initialize in offline mode
      const { enableNetwork } = await import('firebase/firestore');
      
      // Force enable network and wait for it
      try {
        await enableNetwork(db);
        console.log('✅ Firestore network explicitly enabled');
        // Give it time to establish connection
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error('❌ Could not enable network:', error);
      }
      
      // Now set up new listeners
      setupNewListeners();
    };
    
    const setupNewListeners = () => {
      // Fetch user's own projects
      const q = query(collection(db, 'projects'), where('userId', '==', user.uid));
      
      // Set up real-time listener - this handles both initial load and updates
      // DO NOT call getDocs/getDocsFromServer separately - onSnapshot handles everything
      // This prevents "INTERNAL ASSERTION FAILED" errors from conflicting queries
      unsubscribeRef.current = onSnapshot(q, 
        (snapshot) => {
          const isFromCache = snapshot.metadata.fromCache;
          const hasPendingWrites = snapshot.metadata.hasPendingWrites;
          
          console.log('📡 Projects snapshot received:', {
            size: snapshot.size,
            empty: snapshot.empty,
            hasPendingWrites: hasPendingWrites,
            fromCache: isFromCache
          });
          
          const projects = snapshot.docs.map(doc => {
            const data = doc.data();
            console.log('📄 Project document:', { id: doc.id, userId: data.userId, name: data.name });
            return {
              id: doc.id,
              ...data
            } as SavedProject;
          });
          
          console.log(`📊 Processing ${projects.length} projects for user ${user.uid}`);
          
          if (projects.length > 0) {
            console.log('✅ Projects loaded:', projects.map(p => ({ id: p.id, name: p.name, userId: p.userId })), isFromCache ? '(from cache)' : '(from server)');
            setSavedProjects(projects.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
          } else if (!isFromCache) {
            // Only warn if we got empty result from server (not cache)
            console.warn('⚠️ Server returned 0 projects. Verify in Firebase Console that projects exist for user:', user.uid);
            console.warn('Query details:', { collection: 'projects', where: `userId == ${user.uid}`, userUid: user.uid });
          } else {
            console.log('🔄 Waiting for server connection... (currently using cache)');
          }
        }, 
        (error: any) => {
          // Handle Firestore internal errors gracefully
          if (error?.message?.includes('INTERNAL ASSERTION FAILED') || error?.code === 'already-exists') {
            console.warn('⚠️ Firestore listener conflict (harmless - listener will continue working):', error?.code || error?.message?.substring(0, 100));
            // Don't show this to user - it's a timing issue, the listener will still work
            // The "already-exists" error happens when cleanup hasn't fully completed
            // but Firestore will merge the listeners and continue working
            return;
          }
          
          console.error('Error in projects listener:', {
            code: error?.code,
            message: error?.message,
            stack: error?.stack?.substring(0, 200)
          });
          
          // Don't show error for network issues - they're usually temporary
          if (error?.code !== 'unavailable' && error?.code !== 'deadline-exceeded') {
            setError(`Failed to load projects: ${error?.message || 'Unknown error'}`);
          } else {
            console.warn('Projects query failed due to network issue, will retry automatically');
          }
        }
      );
        
      // Fetch projects shared with this user
      const sharedQ = query(collection(db, 'projects'), where('sharedWith', 'array-contains', user.uid));
      unsubscribeSharedRef.current = onSnapshot(sharedQ, async (snapshot) => {
        console.log('📡 Shared projects snapshot received:', {
          size: snapshot.size,
          empty: snapshot.empty,
          fromCache: snapshot.metadata.fromCache
        });
        
        setIsLoadingShared(true);
        const shared = await Promise.all(
          snapshot.docs.map(async (doc) => {
            const data = doc.data();
            console.log('📄 Shared project document:', { id: doc.id, name: data.name, sharedWith: data.sharedWith });
            return {
              id: doc.id,
              ...data
            } as SavedProject;
          })
        );
        
        console.log(`✅ Loaded ${shared.length} shared projects`);
        setSharedProjects(shared.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        setIsLoadingShared(false);
      }, (error: any) => {
        // Handle errors for shared projects listener
        if (error?.code === 'already-exists' || error?.message?.includes('INTERNAL ASSERTION FAILED')) {
          console.warn('⚠️ Shared projects listener conflict (harmless):', error?.code);
          return;
        }
        console.error('Error in shared projects listener:', error);
      });

      return () => {
        console.log('🧹 Cleaning up Firestore listeners');
        isSettingUpRef.current = false;
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
        if (unsubscribeSharedRef.current) {
          unsubscribeSharedRef.current();
          unsubscribeSharedRef.current = null;
        }
      };
    };
    
    // Start the setup process
    setupListeners();
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleGenerateSchedule = () => {
    setMaterials([]);
    setCurrentProjectId(null);
    setShowUploader(true);
    setShowImport(false);
    setImportFile(null);
  };

  const handleImport = () => {
    setMaterials([]);
    setCurrentProjectId(null);
    setShowImport(true);
    setShowUploader(false);
    setImportFile(null);
    setError(null);
  };

  const handleImageSelect = (file: File) => {
    setSelectedImage(file);
    setError(null);
    generateMaterials(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setMaterials([]);
    setError(null);
    setShowUploader(false);
  };

  const generateMaterials = async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/generate-materials', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', errorData);
        throw new Error(`Failed to generate materials: ${errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();
      setMaterials(data.materials);
    } catch (err) {
      setError('Failed to generate materials. Please try again.');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProject = async () => {
    console.log('handleSaveProject called!', { projectName, hasUser: !!user, materialsCount: materials.length });
    
    if (!projectName.trim() || !user) {
      console.warn('Validation failed:', { projectName: projectName.trim(), hasUser: !!user });
      setError('Please enter a project name');
      return;
    }
    
    console.log('Starting save process...');
    setIsSaving(true);
    setError(null);
    
    try {
      console.log('Saving project:', projectName.trim(), 'for user:', user.uid, 'with', materials.length, 'materials');
      
      const projectData = {
        name: projectName.trim(),
        materials: materials,
        userId: user.uid,
        createdAt: new Date(),
        sharedWith: [],
        sharedWithEmails: []
      };
      
      const docRef = await addDoc(collection(db, 'projects'), projectData);
      console.log('✅ Project saved successfully with ID:', docRef.id);
      console.log('📝 Saved project data:', {
        id: docRef.id,
        name: projectName,
        userId: user.uid,
        materialsCount: materials.length,
        createdAt: new Date().toISOString()
      });
      
      // Force refresh the projects list by resetting the listener
      // The real-time listener should pick this up, but let's also manually trigger a refresh
      console.log('🔄 Project saved - real-time listener should update automatically');
      
      setProjectName('');
      setShowSaveDialog(false);
      setCurrentProjectId(null);
      setError(null);
    } catch (error: any) {
      console.error('Error saving project:', error);
      const errorMessage = error?.code === 'permission-denied' 
        ? 'Permission denied. Please check your Firestore rules.'
        : error?.code === 'unavailable'
        ? 'Network error. Please check your connection and try again.'
        : error?.message || 'Failed to save project. Please try again.';
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadProject = async (project: SavedProject) => {
    try {
      // Validate and ensure materials array is properly formatted
      const loadedMaterials = project.materials || [];
      const validMaterials = Array.isArray(loadedMaterials) 
        ? loadedMaterials.filter((item: any) => item && item.code && typeof item.code === 'string')
        : [];
      
      setMaterials(validMaterials);
      setCurrentProjectId(project.id);
      setShowUploader(false);
      setShowImport(false);
      setSelectedImage(null);
      setImportFile(null);
      setError(null);
    } catch (error) {
      console.error('Error loading project:', error);
      setError('Failed to load project');
      setMaterials([]);
    }
  };

  // Check if current project is shared (read-only)
  const isSharedProject = (): boolean => {
    if (!currentProjectId || !user) return false;
    const project = [...savedProjects, ...sharedProjects].find(p => p.id === currentProjectId);
    if (!project) return false;
    // If project is in sharedProjects, it's shared (read-only)
    return sharedProjects.some(p => p.id === currentProjectId);
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    
    try {
      await deleteDoc(doc(db, 'projects', projectId));
    } catch (error) {
      console.error('Error deleting project:', error);
      setError('Failed to delete project');
    }
  };

  const handleShareProject = (projectId: string) => {
    setShareProjectId(projectId);
    setShareEmail('');
    setShowShareDialog(true);
    setError(null);
  };

  const findUserByEmail = async (email: string): Promise<string | null> => {
    try {
      // Check if user exists in users collection
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email.toLowerCase()));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        // Return the UID from the document data or use document ID
        return userData.uid || querySnapshot.docs[0].id;
      }
      return null;
    } catch (error) {
      console.error('Error finding user:', error);
      return null;
    }
  };

  const shareProjectWithUser = async () => {
    if (!shareEmail || !shareProjectId || !user) return;

    const email = shareEmail.trim().toLowerCase();
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    // Don't allow sharing with yourself
    if (email === user.email?.toLowerCase()) {
      setError('You cannot share a project with yourself');
      return;
    }

    setIsSharing(true);
    setError(null);

    try {
      // Get project to check current shares
      const projectRef = doc(db, 'projects', shareProjectId);
      const projectSnap = await getDoc(projectRef);
      
      if (!projectSnap.exists()) {
        setError('Project not found');
        setIsSharing(false);
        return;
      }

      const projectData = projectSnap.data();
      const projectName = projectData.name || 'Untitled Project';
      const currentSharedWith = projectData.sharedWith || [];
      const currentSharedEmails = projectData.sharedWithEmails || [];

      // Check if already shared (by email)
      if (currentSharedEmails.includes(email)) {
        setError('Project is already shared with this email');
        setIsSharing(false);
        return;
      }

      // Find user by email
      const sharedUserId = await findUserByEmail(email);
      
      if (sharedUserId) {
        // User exists - share immediately
        // Check if already shared by user ID
        if (currentSharedWith.includes(sharedUserId)) {
          setError('Project is already shared with this user');
          setIsSharing(false);
          return;
        }

        // Update project with new shared user
        await updateDoc(projectRef, {
          sharedWith: arrayUnion(sharedUserId),
          sharedWithEmails: arrayUnion(email)
        });

        setShareEmail('');
        setShowShareDialog(false);
        setError(null);
      } else {
        // User doesn't exist - create invitation and send email
        try {
          // Create invitation in Firestore first
          console.log('Creating invitation for:', email, 'by user:', user.uid);
          const invitationsRef = collection(db, 'invitations');
          const invitationData = {
            email: email,
            projectId: shareProjectId,
            projectName: projectName,
            inviterId: user.uid,
            inviterEmail: user.email?.toLowerCase() || '',
            inviterName: user.email?.split('@')[0] || 'Someone',
            status: 'pending',
            createdAt: new Date()
          };
          console.log('Invitation data:', invitationData);
          
          const invitationDocRef = await addDoc(invitationsRef, invitationData);
          console.log('Invitation created with ID:', invitationDocRef.id);

          // Add email to sharedWithEmails so we can track it
          await updateDoc(projectRef, {
            sharedWithEmails: arrayUnion(email)
          });
          console.log('Project updated with shared email');

          // Try to send invitation email (this is optional - invitation is already created)
          let emailSent = false;
          let emailError = null;
          try {
            const appUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
            console.log('Sending invitation email to:', email);
            const response = await fetch('/api/send-invitation', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                email: email,
                projectName: projectName,
                inviterName: user.email?.split('@')[0] || 'Someone',
                appUrl: appUrl
              }),
            });

            const result = await response.json();
            console.log('Email API response:', result);
            
            if (response.ok && result.emailSent === true) {
              emailSent = true;
              console.log('Email sent successfully');
            } else {
              emailError = result.message || result.error || 'Email service not configured';
              console.warn('Email not sent. Full response:', result);
              if (result.details) {
                console.warn('Error details:', result.details);
              }
            }
          } catch (emailErr) {
            // Email sending failed, but invitation is already created - that's OK
            emailError = emailErr instanceof Error ? emailErr.message : 'Unknown error';
            console.warn('Could not send invitation email, but invitation was created:', emailErr);
          }

          setShareEmail('');
          setShowShareDialog(false);
          setError(null);
          
          // Show success message
          if (emailSent) {
            alert(`✅ Invitation sent to ${email}!\n\nThey will receive an email to create an account and access the project.`);
          } else {
            const message = `✅ Invitation created for ${email}!\n\nThe invitation will be automatically granted when they sign up with this email.`;
            
            // Check if it's the Resend testing limitation
            if (emailError && emailError.includes('only send testing emails to your own email')) {
              alert(`${message}\n\n📧 Email Note: Resend free accounts can only send test emails to your own address. To send to others, verify a domain at resend.com/domains (or wait until production deployment).`);
            } else if (emailError && emailError !== 'Email service not configured') {
              alert(`${message}\n\n⚠️ Note: Email could not be sent (${emailError}), but the invitation is still active.`);
            } else {
              alert(`${message}\n\n💡 Tip: Add RESEND_API_KEY to your .env.local file to enable email invitations.`);
            }
          }
        } catch (inviteError: any) {
          console.error('Error creating invitation:', inviteError);
          const errorMessage = inviteError?.message || 'Unknown error';
          const errorCode = inviteError?.code || '';
          
          // Provide more specific error messages
          if (errorCode === 'permission-denied') {
            setError('Permission denied. Please check your Firestore security rules for the invitations collection.');
          } else if (errorCode === 'unavailable') {
            setError('Firestore is unavailable. Please check your connection and try again.');
          } else {
            setError(`Failed to create invitation: ${errorMessage}. Please check your Firestore rules and connection.`);
          }
          setIsSharing(false);
          return;
        }
      }
    } catch (error) {
      console.error('Error sharing project:', error);
      setError('Failed to share project. Please try again.');
    } finally {
      setIsSharing(false);
    }
  };

  const removeSharedUser = async (projectId: string, userIdToRemove: string, emailToRemove: string) => {
    if (!confirm('Are you sure you want to remove this user from the project?')) return;

    try {
      const projectRef = doc(db, 'projects', projectId);
      const updates: any = {
        sharedWithEmails: arrayRemove(emailToRemove)
      };
      
      // Only remove from sharedWith if user ID exists
      if (userIdToRemove) {
        updates.sharedWith = arrayRemove(userIdToRemove);
      }
      
      await updateDoc(projectRef, updates);
      
      // Also cancel any pending invitations for this email
      // Note: We can only cancel if we're the inviter (per Firestore rules)
      try {
        const invitationsRef = collection(db, 'invitations');
        const invitationsQuery = query(
          invitationsRef,
          where('email', '==', emailToRemove.toLowerCase()),
          where('projectId', '==', projectId),
          where('status', '==', 'pending')
        );
        const invitationsSnapshot = await getDocs(invitationsQuery);
        
        // Only cancel invitations where current user is the inviter (per Firestore rules)
        const cancelPromises = invitationsSnapshot.docs
          .filter(doc => doc.data().inviterId === user?.uid)
          .map(async (invitationDoc) => {
            await updateDoc(doc(db, 'invitations', invitationDoc.id), {
              status: 'cancelled',
              cancelledAt: new Date()
            });
          });
        
        await Promise.all(cancelPromises);
      } catch (error) {
        console.warn('Could not cancel invitations (this is OK if user is not the inviter):', error);
        // Continue even if invitation cancellation fails - not critical
      }
    } catch (error) {
      console.error('Error removing shared user:', error);
      setError('Failed to remove user');
    }
  };

  const handleFileSelect = (file: File) => {
    setImportFile(file);
    setError(null);
    parseFile(file);
  };

  const parseFile = async (file: File) => {
    setIsParsing(true);
    setError(null);

    try {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      let materials: BIMItem[] = [];

      if (fileExtension === 'csv') {
        materials = await parseCSV(file);
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        materials = await parseExcel(file);
      } else {
        throw new Error('Unsupported file format. Please upload a CSV or Excel file.');
      }

      if (materials.length === 0) {
        throw new Error('No materials found in the file. Please check the file format.');
      }

      setMaterials(materials);
      setCurrentProjectId(null); // Reset project ID so imported materials can be saved as new project
      setShowImport(false);
    } catch (err: any) {
      setError(err.message || 'Failed to parse file. Please check the file format.');
      console.error('Error parsing file:', err);
    } finally {
      setIsParsing(false);
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last field
    result.push(current.trim());
    return result;
  };

  const parseCSV = async (file: File): Promise<BIMItem[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          
          if (lines.length < 2) {
            reject(new Error('CSV file must have at least a header row and one data row'));
            return;
          }

          // Parse header row
          const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
          
          // Map header names to BIMItem fields
          const headerMap: Record<string, string> = {
            'code': 'code',
            'area': 'area',
            'location of finish': 'location',
            'location': 'location',
            'finish': 'finish',
            'material': 'type',
            'type': 'type',
            'recommended supplier': 'supplierAndContact',
            'supplier and contact': 'supplierAndContact',
            'supplier': 'supplierAndContact',
            'price per sqm (low)': 'priceLow',
            'price per sqm (mid)': 'priceMid',
            'price per sqm (high)': 'priceHigh',
            'low': 'priceLow',
            'mid': 'priceMid',
            'high': 'priceHigh',
          };

          const materials: BIMItem[] = [];
          
          // Parse data rows
          for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, '').trim());
            if (values.length === 0 || values.every(v => !v)) continue;

            const item: any = {
              code: '',
              area: '',
              location: '',
              finish: '',
              supplierAndContact: '',
              type: '',
              pricePerSqm: {
                low: 0,
                mid: 0,
                high: 0,
              },
            };

            headers.forEach((header, index) => {
              const mappedField = headerMap[header];
              const value = values[index] || '';

              if (mappedField) {
                if (mappedField === 'priceLow') {
                  item.pricePerSqm.low = parseFloat(value) || 0;
                } else if (mappedField === 'priceMid') {
                  item.pricePerSqm.mid = parseFloat(value) || 0;
                } else if (mappedField === 'priceHigh') {
                  item.pricePerSqm.high = parseFloat(value) || 0;
                } else {
                  item[mappedField] = value;
                }
              }
            });

            // Only add item if it has at least a code
            if (item.code) {
              materials.push(item as BIMItem);
            }
          }

          resolve(materials);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read CSV file'));
      reader.readAsText(file);
    });
  };

  const parseExcel = async (file: File): Promise<BIMItem[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

          if (jsonData.length < 2) {
            reject(new Error('Excel file must have at least a header row and one data row'));
            return;
          }

          // Parse header row
          const headers = (jsonData[0] as string[]).map(h => (h || '').toString().trim().toLowerCase());
          
          // Map header names to BIMItem fields
          const headerMap: Record<string, string> = {
            'code': 'code',
            'area': 'area',
            'location of finish': 'location',
            'location': 'location',
            'finish': 'finish',
            'material': 'type',
            'type': 'type',
            'recommended supplier': 'supplierAndContact',
            'supplier and contact': 'supplierAndContact',
            'supplier': 'supplierAndContact',
            'price per sqm (low)': 'priceLow',
            'price per sqm (mid)': 'priceMid',
            'price per sqm (high)': 'priceHigh',
            'low': 'priceLow',
            'mid': 'priceMid',
            'high': 'priceHigh',
          };

          const materials: BIMItem[] = [];
          
          // Parse data rows
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;

            const item: any = {
              code: '',
              area: '',
              location: '',
              finish: '',
              supplierAndContact: '',
              type: '',
              pricePerSqm: {
                low: 0,
                mid: 0,
                high: 0,
              },
            };

            headers.forEach((header, index) => {
              const mappedField = headerMap[header];
              const value = row[index] ? String(row[index]).trim() : '';

              if (mappedField) {
                if (mappedField === 'priceLow') {
                  item.pricePerSqm.low = parseFloat(value) || 0;
                } else if (mappedField === 'priceMid') {
                  item.pricePerSqm.mid = parseFloat(value) || 0;
                } else if (mappedField === 'priceHigh') {
                  item.pricePerSqm.high = parseFloat(value) || 0;
                } else {
                  item[mappedField] = value;
                }
              }
            });

            // Only add item if it has at least a code
            if (item.code) {
              materials.push(item as BIMItem);
            }
          }

          resolve(materials);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read Excel file'));
      reader.readAsArrayBuffer(file);
    });
  };

  return (
    <div className="min-h-screen flex overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-1/3 h-screen flex flex-col items-center overflow-y-auto"
           style={{ backgroundColor: '#42504A' }}>
        
        {/* Logo Box */}
        <div className="w-full px-8 py-8 rounded-lg mb-8"
             style={{ backgroundColor: '#445D56', borderRadius: '0' }}>
          {/* Logo */}
          <div className="text-[12rem] font-bold text-white mb-6 text-center" style={{ letterSpacing: '0.05em', lineHeight: '1' }}>
            P
          </div>

          {/* Welcome Section */}
          <div className="text-center">
            <div className="text-xl text-white mb-2 font-semibold">
              Welcome Back
            </div>
            <div className="text-sm text-white">
              {user?.email || 'Loading...'}
            </div>
          </div>
        </div>

        {/* Generate Schedule Button */}
        <button
          onClick={handleGenerateSchedule}
          className="w-64 py-4 px-6 text-2xl text-white font-semibold rounded-lg transition-opacity hover:opacity-80 mb-4"
          style={{ backgroundColor: '#6A7E76' }}
        >
          Generate Schedule
        </button>

        {/* Import Button */}
        <button
          onClick={handleImport}
          className="w-64 py-4 px-6 text-2xl text-white font-semibold rounded-lg transition-opacity hover:opacity-80"
          style={{ backgroundColor: '#6A7E76' }}
        >
          Import
        </button>

        {/* Saved Projects Section */}
        <div className="w-full max-w-xs mt-8 px-4">
          <h3 className="text-lg font-semibold text-white mb-4">
            My Projects
          </h3>
          <div className="space-y-2">
            {savedProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between p-3 rounded-lg text-white hover:opacity-80 transition-opacity"
                style={{ backgroundColor: '#6A7E76' }}
              >
                <span 
                  className="flex-1 truncate cursor-pointer"
                  onClick={() => handleLoadProject(project)}
                >
                  {project.name}
                </span>
                <div className="flex items-center space-x-1 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShareProject(project.id);
                    }}
                    className="p-1 rounded transition-colors"
                    style={{ color: '#FFFFFF' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    title="Share project"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(project.id);
                    }}
                    className="p-1 rounded transition-colors"
                    style={{ color: '#FF0000' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 0, 0, 0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    title="Delete project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {savedProjects.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">
                No saved projects yet
              </p>
            )}
          </div>
        </div>

        {/* Shared Projects Section */}
        {sharedProjects.length > 0 && (
          <div className="w-full max-w-xs mt-8 px-4">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Shared With Me
            </h3>
            <div className="space-y-2">
              {sharedProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-3 rounded-lg text-white hover:opacity-80 transition-opacity cursor-pointer"
                  style={{ backgroundColor: '#6A7E76' }}
                  onClick={() => handleLoadProject(project)}
                >
                  <span className="flex-1 truncate">{project.name}</span>
                  <span className="text-xs text-gray-300 ml-2">(Read-only)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="mt-auto mb-2 py-2 px-6 text-white rounded-lg transition-opacity hover:opacity-80"
          style={{ backgroundColor: '#6A7E76' }}
        >
          Logout
        </button>

        {/* Copyright */}
        <div className="text-white text-xs text-center mb-4">
          © PaletteSchedule 2025. All rights reserved.
        </div>
      </div>

      {/* Right Main Content Area */}
      <div className="w-2/3 h-screen bg-white overflow-y-auto pl-8">
        {showImport && materials.length === 0 && !isParsing && (
          <div className="h-full flex items-center justify-center p-8">
            <div className="w-full max-w-2xl">
              <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">
                Import CSV or Excel File
              </h3>
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                  isDragOver 
                    ? 'border-green-500 bg-green-50' 
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
                    handleFileSelect(file);
                  } else {
                    setError('Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
                  }
                }}
              >
                <input
                  type="file"
                  id="file-upload"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileSelect(file);
                    }
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <FileUp className="w-16 h-16 mb-4" style={{ color: '#42504A' }} />
                  <span className="text-lg font-semibold text-gray-700 mb-2">
                    Click to upload or drag and drop
                  </span>
                  <span className="text-sm text-gray-500">
                    CSV or Excel files (.csv, .xlsx, .xls)
                  </span>
                </label>
              </div>
              {importFile && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    Selected file: <span className="font-semibold">{importFile.name}</span>
                  </p>
                </div>
              )}
              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700">{error}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {isParsing && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin" style={{ color: '#42504A' }} />
              <h3 className="text-2xl font-bold text-gray-800 mb-2">
                Parsing File
              </h3>
              <p className="text-lg text-gray-600">
                Reading and processing your file... This may take a few seconds.
              </p>
            </div>
          </div>
        )}

        {!showUploader && !showImport && materials.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-lg px-8">
              <div className="mb-8">
                <svg 
                  className="w-24 h-24 mx-auto mb-6 text-gray-300" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={1.5} 
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
                  />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-4">
                No Saved Projects Yet
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Start by generating your first material schedule. Upload an image of your space and let AI analyze the materials for you.
              </p>
              <button
                onClick={handleGenerateSchedule}
                className="inline-flex items-center px-8 py-4 text-lg font-semibold text-white rounded-lg transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#42504A' }}
              >
                <svg 
                  className="w-6 h-6 mr-3" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M12 4v16m8-8H4" 
                  />
                </svg>
                Generate Your First Schedule
              </button>
            </div>
          </div>
        )}

        {showUploader && materials.length === 0 && !isLoading && (
          <div className="h-full flex items-center justify-center p-8">
            <div className="w-full max-w-2xl">
              <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">
                Upload an Image to Generate Schedule
              </h3>
              <ImageUpload
                onImageSelect={handleImageSelect}
                selectedImage={selectedImage}
                onRemoveImage={handleRemoveImage}
              />
              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700">{error}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin" style={{ color: '#42504A' }} />
              <h3 className="text-2xl font-bold text-gray-800 mb-2">
                Generating Your Schedule
              </h3>
              <p className="text-lg text-gray-600">
                AI is analyzing your image... This may take a few seconds.
              </p>
            </div>
          </div>
        )}

        {materials.length > 0 && !isLoading && (
          <div className="py-8 pr-8">
            {/* Save Project / Save Changes Buttons */}
            {!isSharedProject() && (
              <div className="mb-6 flex justify-end space-x-3">
                {currentProjectId && (
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    className="inline-flex items-center px-6 py-3 text-white font-semibold rounded-lg transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#6A7E76' }}
                  >
                    <Save className="w-5 h-5 mr-2" />
                    Save as New Project
                  </button>
                )}
                {!currentProjectId && (
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    className="inline-flex items-center px-6 py-3 text-white font-semibold rounded-lg transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#6A7E76' }}
                  >
                    <Save className="w-5 h-5 mr-2" />
                    Save Project
                  </button>
                )}
              </div>
            )}

            {/* Save Dialog */}
            {showSaveDialog && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
                  <h3 className="text-2xl font-bold text-gray-800 mb-4">
                    Save Project
                  </h3>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Enter project name"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:border-gray-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && projectName.trim()) {
                        handleSaveProject();
                      }
                    }}
                  />
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        setShowSaveDialog(false);
                        setProjectName('');
                      }}
                      className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={(e) => {
                        console.log('Save button clicked!', { projectName, isSaving, hasUser: !!user, materialsCount: materials.length });
                        e.preventDefault();
                        handleSaveProject();
                      }}
                      disabled={!projectName.trim() || isSaving}
                      className="px-6 py-3 text-white rounded-lg transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: '#42504A' }}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <MaterialSchedule 
              materials={materials} 
              isLoading={false}
              onMaterialsChange={(editedMaterials) => {
                // Don't allow changes if project is shared (read-only)
                if (!isSharedProject()) {
                  setPendingMaterials(editedMaterials);
                }
              }}
              onSaveChanges={(editedMaterials) => {
                // Don't allow saving if project is shared (read-only)
                if (isSharedProject()) {
                  setError('This project is read-only. You cannot modify shared projects.');
                  return;
                }
                setPendingMaterials(editedMaterials);
                if (currentProjectId) {
                  setShowOverwriteDialog(true);
                } else {
                  // If no current project, just update the materials state
                  setMaterials(editedMaterials);
                }
              }}
              readOnly={isSharedProject()}
            />
            
            {/* Overwrite Confirmation Dialog */}
            {showOverwriteDialog && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
                  <h3 className="text-2xl font-bold text-gray-800 mb-4">
                    Overwrite Project?
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Do you want to overwrite the current saved project with your changes?
                  </p>
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        setShowOverwriteDialog(false);
                        setPendingMaterials([]);
                      }}
                      className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (currentProjectId && pendingMaterials.length > 0 && !isSharedProject()) {
                          try {
                            await updateDoc(doc(db, 'projects', currentProjectId), {
                              materials: pendingMaterials,
                              updatedAt: new Date()
                            });
                            setMaterials(pendingMaterials);
                            setShowOverwriteDialog(false);
                            setPendingMaterials([]);
                            setError(null);
                          } catch (error) {
                            console.error('Error updating project:', error);
                            setError('Failed to update project');
                            setShowOverwriteDialog(false);
                          }
                        }
                      }}
                      className="px-6 py-3 text-white rounded-lg transition-opacity hover:opacity-90"
                      style={{ backgroundColor: '#42504A' }}
                    >
                      Yes, Overwrite
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Share Project Dialog */}
            {showShareDialog && shareProjectId && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
                  <h3 className="text-2xl font-bold text-gray-800 mb-4">
                    Share Project
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Invite someone to view this project (read-only). If they don&apos;t have an account, they&apos;ll receive an email invitation to sign up.
                  </p>
                  
                  {/* List of currently shared users */}
                  {(() => {
                    const project = savedProjects.find(p => p.id === shareProjectId);
                    const sharedEmails = project?.sharedWithEmails || [];
                    const sharedUserIds = project?.sharedWith || [];
                    
                    // Check which emails have accounts (are in sharedUserIds) vs pending invitations
                    const sharedUsersList = sharedEmails.map((email, index) => {
                      const userId = sharedUserIds[index] || null;
                      return {
                        email,
                        userId,
                        hasAccount: userId !== null && userId !== undefined
                      };
                    });
                    
                    return sharedUsersList.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Shared with:</p>
                        <div className="space-y-2">
                          {sharedUsersList.map((item, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-700">{item.email}</span>
                                {!item.hasAccount && (
                                  <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
                                    Invitation sent
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  if (item.userId) {
                                    removeSharedUser(shareProjectId, item.userId, item.email);
                                  } else {
                                    // Remove pending invitation
                                    removeSharedUser(shareProjectId, '', item.email);
                                  }
                                }}
                                className="p-1 rounded hover:bg-red-100 transition-colors"
                                title="Remove user"
                              >
                                <X className="w-4 h-4 text-red-600" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="mb-4">
                    <label htmlFor="share-email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="share-email"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && shareEmail.trim()) {
                          shareProjectWithUser();
                        }
                      }}
                    />
                  </div>

                  {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        setShowShareDialog(false);
                        setShareEmail('');
                        setError(null);
                      }}
                      className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={shareProjectWithUser}
                      disabled={!shareEmail.trim() || isSharing}
                      className="px-6 py-3 text-white rounded-lg transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: '#42504A' }}
                    >
                      {isSharing ? (
                        <>
                          <Loader2 className="w-4 h-4 inline-block mr-2 animate-spin" />
                          Sharing...
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 inline-block mr-2" />
                          Share
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
