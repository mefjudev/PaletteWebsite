'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { doc, setDoc, collection, query, where, getDocs, updateDoc, arrayUnion } from 'firebase/firestore';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        // Login
        await signInWithEmailAndPassword(auth, email, password);
        router.push('/dashboard'); // You can change this to your desired route
      } else {
        // Registration
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const userEmail = email.toLowerCase();
        
        // Create user record in Firestore for sharing functionality
        try {
          await setDoc(doc(db, 'users', user.uid), {
            email: userEmail,
            uid: user.uid,
            createdAt: new Date()
          });
        } catch (error) {
          console.error('Error creating user record:', error);
          // Continue even if user record creation fails
        }
        
        // Check for pending invitations and auto-grant access
        try {
          const invitationsRef = collection(db, 'invitations');
          const invitationsQuery = query(
            invitationsRef,
            where('email', '==', userEmail),
            where('status', '==', 'pending')
          );
          const invitationsSnapshot = await getDocs(invitationsQuery);
          
          if (!invitationsSnapshot.empty) {
            // Process each invitation
            const updatePromises = invitationsSnapshot.docs.map(async (invitationDoc) => {
              const invitationData = invitationDoc.data();
              const projectId = invitationData.projectId;
              
              // Update invitation status
              await updateDoc(doc(db, 'invitations', invitationDoc.id), {
                status: 'accepted',
                acceptedAt: new Date(),
                acceptedBy: user.uid
              });
              
              // Grant access to the project
              const projectRef = doc(db, 'projects', projectId);
              await updateDoc(projectRef, {
                sharedWith: arrayUnion(user.uid)
              });
            });
            
            await Promise.all(updatePromises);
          }
        } catch (error) {
          console.error('Error processing invitations:', error);
          // Continue even if invitation processing fails
        }
        
        // After registration, you might want to log them in automatically
        router.push('/dashboard'); // You can change this to your desired route
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
         style={{ backgroundColor: '#445D56' }}>
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Logo */}
        <div className="mb-12 w-full px-8 flex justify-center items-center">
          <img
            src="/LogoWhite.svg"
            alt="Palette Logo"
            className="h-36 w-auto ml-4"
          />
        </div>

        {/* Login Form Container */}
        <div className="w-full p-8 rounded-lg"
             style={{ backgroundColor: '#596B64' }}>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Login/Email Field */}
          <div className="flex flex-col">
            <label htmlFor="email" className="text-white mb-2">
              Login:
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="px-4 py-2 rounded-lg outline-none text-white placeholder-gray-400"
              style={{ backgroundColor: '#6A7E76' }}
              placeholder="Enter your email"
            />
          </div>

          {/* Password Field */}
          <div className="flex flex-col">
            <label htmlFor="password" className="text-white mb-2">
              Password:
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="px-4 py-2 rounded-lg outline-none text-white placeholder-gray-400"
              style={{ backgroundColor: '#6A7E76' }}
              placeholder="Enter your password"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg text-white font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#6A7E76' }}
          >
            {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
          </button>
        </form>

        {/* Action Links */}
        <div className="mt-6 text-center text-white text-sm">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="underline hover:no-underline mr-4"
          >
            {isLogin ? 'Sign up here' : 'Login here'}
          </button>
          {isLogin && (
            <>
              <span className="mx-2">-</span>
              <button
                onClick={() => {
                  // TODO: Implement forgot password functionality
                  alert('Forgot password functionality will be implemented');
                }}
                className="underline hover:no-underline"
              >
                Forgot your password?
              </button>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

