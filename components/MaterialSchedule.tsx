'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { BIMItem } from '@/lib/types/bim';
import { Download, Copy, Save, FileSpreadsheet, Plus, Trash2, Upload, X, Loader2, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import { compressImage } from '@/lib/utils/imageCompressor';

interface MaterialScheduleProps {
  materials: BIMItem[];
  isLoading: boolean;
  onMaterialsChange?: (materials: BIMItem[]) => void;
  onSaveChanges?: (materials: BIMItem[]) => void;
  readOnly?: boolean; // If true, disable editing
}

type FilterCategory = 'All' | 'Timber' | 'Metal' | 'Glass' | 'Plastic' | 'Specialist' | 'Fabric' | 'Sanitaryware' | 'Ironmongery' | 'Ceramic Tiles' | 'Paint' | 'Stone' | 'Unknown';

const CATEGORY_CODES: Record<FilterCategory, string[]> = {
  'All': [],
  'Timber': ['TI', 'WD'],
  'Metal': ['MT'],
  'Glass': ['GL'],
  'Plastic': ['PL'],
  'Specialist': ['SF'],
  'Fabric': ['FA'],
  'Sanitaryware': ['SAN'],
  'Ironmongery': ['IRO'],
  'Ceramic Tiles': ['CT'],
  'Paint': ['PT'],
  'Stone': ['ST'],
  'Unknown': ['UN'],
};

// Reverse mapping: code prefix to category name
const CODE_TO_CATEGORY: Record<string, FilterCategory> = {
  'TI': 'Timber',
  'WD': 'Timber',
  'MT': 'Metal',
  'GL': 'Glass',
  'PL': 'Plastic',
  'SF': 'Specialist',
  'FA': 'Fabric',
  'SAN': 'Sanitaryware',
  'IRO': 'Ironmongery',
  'CT': 'Ceramic Tiles',
  'PT': 'Paint',
  'ST': 'Stone',
  'UN': 'Unknown',
};

const MaterialSchedule: React.FC<MaterialScheduleProps> = ({ materials, isLoading, onMaterialsChange, onSaveChanges, readOnly = false }) => {
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('All');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [editedMaterials, setEditedMaterials] = useState<BIMItem[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [scannedMaterials, setScannedMaterials] = useState<BIMItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedScannedMaterials, setSelectedScannedMaterials] = useState<Set<number>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSheetRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);

  // Ensure materials is always a valid array
  const safeMaterials = useMemo(() => {
    if (!materials) return [];
    if (!Array.isArray(materials)) return [];
    return materials.filter(item => item && typeof item === 'object');
  }, [materials]);

  // Initialize edited materials when materials change
  useEffect(() => {
    if (safeMaterials.length > 0) {
      // Only reset if materials actually changed (by comparing first item code)
      const materialsChanged = editedMaterials.length === 0 || 
        (safeMaterials[0]?.code !== editedMaterials[0]?.code);
      
      if (materialsChanged) {
        setEditedMaterials([...safeMaterials]);
        setSelectedRows(new Set());
        setHasUnsavedChanges(false);
      }
    } else {
      setEditedMaterials([]);
      setSelectedRows(new Set());
      setHasUnsavedChanges(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeMaterials]);

  // Handle material updates
  const handleMaterialUpdate = (index: number, field: keyof BIMItem, value: string | number) => {
    const updated = [...editedMaterials];
    if (updated[index]) {
      if (field === 'pricePerSqm' && typeof value === 'number') {
        // Handle price updates separately if needed
        return;
      } else {
        (updated[index] as any)[field] = value;
      }
      setEditedMaterials(updated);
      setHasUnsavedChanges(true);
      if (onMaterialsChange) {
        onMaterialsChange(updated);
      }
    }
  };

  // Handle price update
  const handlePriceUpdate = (index: number, priceType: 'low' | 'mid' | 'high', value: string) => {
    const updated = [...editedMaterials];
    if (updated[index]) {
      if (!updated[index].pricePerSqm) {
        updated[index].pricePerSqm = { low: 0, mid: 0, high: 0 };
      }
      const numValue = value === '' ? 0 : parseFloat(value) || 0;
      (updated[index].pricePerSqm as any)[priceType] = numValue;
      setEditedMaterials(updated);
      setHasUnsavedChanges(true);
      if (onMaterialsChange) {
        onMaterialsChange(updated);
      }
    }
  };

  // Toggle row selection
  const toggleRowSelection = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  // Handle save changes
  const handleSaveChanges = () => {
    if (onSaveChanges && hasUnsavedChanges) {
      onSaveChanges(editedMaterials);
      setHasUnsavedChanges(false);
      setSelectedRows(new Set());
    }
  };

  // Handle adding a new row - creates a completely blank row
  const handleAddNewRow = () => {
    const newItem: BIMItem = {
      code: '', // Completely blank - user will type the code manually
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

    const updated = [...editedMaterials, newItem];
    setEditedMaterials(updated);
    setHasUnsavedChanges(true);
    
    // Auto-select the new row so user can start editing immediately
    // The new row will be at the end initially, but will sort automatically when code is entered
    const newIndex = updated.length - 1;
    setSelectedRows(new Set([newIndex]));

    if (onMaterialsChange) {
      onMaterialsChange(updated);
    }

    // Scroll to the table body after a short delay to ensure DOM is updated
    setTimeout(() => {
      if (tableBodyRef.current) {
        const lastRow = tableBodyRef.current.lastElementChild as HTMLElement;
        if (lastRow) {
          lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          tableBodyRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      }
    }, 100);
  };

  // Handle deleting a row
  const handleDeleteRow = (index: number) => {
    const item = sortedMaterials[index];
    const code = item?.code || 'this row';
    
    // Show confirmation alert
    if (window.confirm(`Are you sure you want to delete ${code}? This action cannot be undone.`)) {
      // Find the actual index in editedMaterials
      const actualIndex = editedMaterials.findIndex(m => m.code === item.code);
      
      if (actualIndex >= 0) {
        const updated = editedMaterials.filter((_, i) => i !== actualIndex);
        setEditedMaterials(updated);
        setHasUnsavedChanges(true);
        
        // Clear selection if the deleted row was selected
        const newSelected = new Set(selectedRows);
        newSelected.delete(index);
        setSelectedRows(newSelected);
        
        if (onMaterialsChange) {
          onMaterialsChange(updated);
        }
      }
    }
  };

  // Handle opening upload sheet
  const handleOpenUploadSheet = () => {
    setShowUploadSheet(true);
    setUploadedImage(null);
    setScannedMaterials([]);
    setSelectedScannedMaterials(new Set());
    
    // Scroll to upload sheet after a short delay to ensure DOM is updated
    setTimeout(() => {
      if (uploadSheetRef.current) {
        uploadSheetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Handle closing upload sheet
  const handleCloseUploadSheet = () => {
    setShowUploadSheet(false);
    setUploadedImage(null);
    setScannedMaterials([]);
    setSelectedScannedMaterials(new Set());
  };

  // Handle image selection for upload
  const handleImageSelect = async (file: File) => {
    setUploadedImage(file);
    await generateScannedMaterials(file);
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));
    
    if (imageFile) {
      try {
        const compressedFile = await compressImage(imageFile);
        handleImageSelect(compressedFile);
      } catch (error) {
        console.error("Image compression failed:", error);
        handleImageSelect(imageFile);
      }
    }
  };

  // Generate materials from uploaded image
  const generateScannedMaterials = async (file: File) => {
    setIsScanning(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/generate-materials', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to generate materials: ${errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();
      setScannedMaterials(data.materials || []);
    } catch (err) {
      console.error('Error generating scanned materials:', err);
      setScannedMaterials([]);
    } finally {
      setIsScanning(false);
    }
  };

  // Toggle selection of scanned material
  const toggleScannedMaterialSelection = (index: number) => {
    const newSelected = new Set(selectedScannedMaterials);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedScannedMaterials(newSelected);
  };

  // Helper function to get the next available code number for a prefix
  const getNextAvailableCode = (prefix: string, existingMaterials: BIMItem[]): string => {
    // Extract all codes with this prefix
    const existingCodes = existingMaterials
      .map(m => m.code)
      .filter(code => {
        const parts = code.split('-');
        return parts.length >= 2 && parts[0] === prefix;
      })
      .map(code => {
        const parts = code.split('-');
        const num = parseInt(parts[1], 10);
        return isNaN(num) ? 0 : num;
      })
      .sort((a, b) => b - a); // Sort descending

    // Find the highest number and add 1
    const nextNumber = existingCodes.length > 0 ? existingCodes[0] + 1 : 1;
    
    // Format with leading zero if less than 10
    const formattedNumber = nextNumber < 10 ? `0${nextNumber}` : `${nextNumber}`;
    return `${prefix}-${formattedNumber}`;
  };

  // Append selected scanned materials to current project
  const handleAppendSelectedMaterials = () => {
    if (selectedScannedMaterials.size === 0) {
      alert('Please select at least one material to append.');
      return;
    }

    // Show confirmation alert
    const confirmMessage = `Are you sure you want to append ${selectedScannedMaterials.size} material(s) to the current project?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    // Process materials one by one, updating the existing materials list as we go
    // This ensures that if multiple materials with the same code are appended,
    // each gets the next available number
    let currentMaterials = [...editedMaterials];
    const materialsToAppend = Array.from(selectedScannedMaterials).map(index => {
      const material = { ...scannedMaterials[index] };
      
      // Check if code already exists in current materials (including previously appended ones)
      const codeExists = currentMaterials.some(m => m.code === material.code);
      
      if (codeExists) {
        // Extract prefix from code (e.g., "CT" from "CT-01")
        const parts = material.code.split('-');
        if (parts.length >= 2) {
          const prefix = parts[0];
          // Get next available code number based on current materials
          material.code = getNextAvailableCode(prefix, currentMaterials);
        }
      }
      
      // Add this material to currentMaterials so the next one can check against it
      currentMaterials.push(material);
      
      return material;
    });

    const updatedMaterials = [...editedMaterials, ...materialsToAppend];
    
    setEditedMaterials(updatedMaterials);
    setHasUnsavedChanges(true);
    
    if (onMaterialsChange) {
      onMaterialsChange(updatedMaterials);
    }

    // Close upload sheet and reset
    handleCloseUploadSheet();
  };

  // Compute filtered materials
  const filteredMaterials = useMemo(() => {
    const materialsToFilter = editedMaterials.length > 0 ? editedMaterials : safeMaterials;
    
    if (!materialsToFilter || materialsToFilter.length === 0) {
      return [];
    }

    if (activeFilter === 'All') {
      return materialsToFilter;
    }

    const allowedPrefixes = CATEGORY_CODES[activeFilter];
    if (!allowedPrefixes || allowedPrefixes.length === 0) {
      return materialsToFilter;
    }

    return materialsToFilter.filter(item => {
      if (!item || !item.code || typeof item.code !== 'string') {
        return false;
      }
      const parts = item.code.split('-');
      if (parts.length === 0 || !parts[0]) {
        return false;
      }
      const codePrefix = parts[0];
      return allowedPrefixes.includes(codePrefix);
    });
  }, [editedMaterials, safeMaterials, activeFilter]);

  // Compute sorted materials
  const sortedMaterials = useMemo(() => {
    return [...filteredMaterials].sort((a, b) => {
      if (!a || !a.code || !b || !b.code) {
        return 0;
      }

      const getCodePrefix = (code: string) => {
        const parts = code.split('-');
        return parts[0] || '';
      };

      const aCodePrefix = getCodePrefix(a.code);
      const bCodePrefix = getCodePrefix(b.code);

      if (aCodePrefix < bCodePrefix) return -1;
      if (aCodePrefix > bCodePrefix) return 1;

      const getCodeNumber = (code: string) => {
        const parts = code.split('-');
        if (parts.length < 2) return 0;
        const num = parseInt(parts[1], 10);
        return isNaN(num) ? 0 : num;
      };
      
      const aCodeNum = getCodeNumber(a.code);
      const bCodeNum = getCodeNumber(b.code);

      if (aCodeNum < bCodeNum) return -1;
      if (aCodeNum > bCodeNum) return 1;

      return 0;
    });
  }, [filteredMaterials]);


  // Get available categories based on materials in the schedule
  const availableCategories = useMemo((): FilterCategory[] => {
    if (!safeMaterials || safeMaterials.length === 0) {
      return ['All'];
    }

    const codePrefixes = new Set<string>();
    safeMaterials.forEach(item => {
      if (item && item.code && typeof item.code === 'string') {
        const parts = item.code.split('-');
        if (parts.length > 0 && parts[0]) {
          codePrefixes.add(parts[0]);
        }
      }
    });

    const categories: FilterCategory[] = ['All'];
    codePrefixes.forEach(prefix => {
      const category = CODE_TO_CATEGORY[prefix];
      if (category && !categories.includes(category)) {
        categories.push(category);
      }
    });

    return categories;
  }, [safeMaterials]);

  // Reset filter to All if current filter is no longer available
  useEffect(() => {
    if (activeFilter !== 'All' && !availableCategories.includes(activeFilter)) {
      setActiveFilter('All');
    }
  }, [availableCategories, activeFilter]);


  const exportToCSV = () => {
    const materialsToExport = editedMaterials.length > 0 ? editedMaterials : safeMaterials;
    const headers = [
      'Code', 'Area', 'Location of Finish', 'Finish',
      'Supplier and Contact', 'Price per sqm (Low)', 'Price per sqm (Mid)', 'Price per sqm (High)', 'Type'
    ];
    const csvContent = [
      headers.join(','),
      ...materialsToExport.map(item => [
        item.code,
        item.area,
        item.location,
        item.finish || '',
        item.supplierAndContact,
        item.pricePerSqm?.low || '',
        item.pricePerSqm?.mid || '',
        item.pricePerSqm?.high || '',
        item.type || '',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bim-materials.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToExcel = () => {
    const materialsToExport = editedMaterials.length > 0 ? editedMaterials : safeMaterials;
    
    // Prepare data for Excel - matching the table column order
    const excelData = materialsToExport.map(item => ({
      'Code': item.code,
      'Area': item.area,
      'Location of Finish': item.location,
      'Material': item.type || '',
      'Recommended Supplier': item.supplierAndContact,
      'Price per sqm (Low)': item.pricePerSqm?.low || '',
      'Price per sqm (Mid)': item.pricePerSqm?.mid || '',
      'Price per sqm (High)': item.pricePerSqm?.high || '',
    }));

    // Create a new workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set column widths for better readability
    const columnWidths = [
      { wch: 12 }, // Code
      { wch: 15 }, // Area
      { wch: 20 }, // Location of Finish
      { wch: 15 }, // Material
      { wch: 30 }, // Recommended Supplier
      { wch: 18 }, // Price per sqm (Low)
      { wch: 18 }, // Price per sqm (Mid)
      { wch: 18 }, // Price per sqm (High)
    ];
    worksheet['!cols'] = columnWidths;

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'BIM Materials');

    // Generate Excel file and download
    XLSX.writeFile(workbook, 'bim-materials.xlsx');
  };

  const copyToClipboard = async () => {
    const materialsToCopy = editedMaterials.length > 0 ? editedMaterials : safeMaterials;
    const text = materialsToCopy.map(item => 
      `${item.code} - ${item.area} - ${item.location} - ${item.finish || ''} - ${item.supplierAndContact} - Low: £${item.pricePerSqm?.low || '-'} Mid: £${item.pricePerSqm?.mid || '-'} High: £${item.pricePerSqm?.high || '-'} - Type: ${item.type || '-'}`
    ).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (safeMaterials.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <p className="text-gray-500">No materials generated yet. Upload an image and click &quot;Generate Materials&quot; to get started.</p>
      </div>
    );
  }

  if (filteredMaterials.length === 0 && activeFilter !== 'All') {
    return (
      <div className="bg-white rounded-lg shadow-md relative">
        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-4 right-4 z-50 animate-fade-in">
            <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium">Copied to clipboard!</span>
            </div>
          </div>
        )}
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">BIM Material Schedule</h3>
            <div className="flex space-x-2">
              <button
                onClick={copyToClipboard}
                className="flex items-center px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center px-3 py-2 text-sm text-white rounded-md transition-colors"
                style={{ backgroundColor: '#42504A' }}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </button>
              <button
                onClick={exportToExcel}
                className="flex items-center px-3 py-2 text-sm text-white rounded-md transition-colors"
                style={{ backgroundColor: '#42504A' }}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export Excel
              </button>
            </div>
          </div>
        </div>
        
        {/* Filter Bar */}
        <div className="border-t border-black px-6 py-3" style={{ backgroundColor: '#42504A' }}>
          <div className="flex flex-wrap gap-2">
            {availableCategories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveFilter(category)}
                className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                  activeFilter === category
                    ? 'bg-gray-800 text-white font-semibold'
                    : 'bg-transparent text-white hover:opacity-80'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
        
        <div className="border-b border-gray-200"></div>
        
        <div className="p-6 text-center">
          <p className="text-gray-500">No materials found for the selected filter: {activeFilter}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md relative">
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">Copied to clipboard!</span>
          </div>
        </div>
      )}
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">BIM Material Schedule</h3>
          <div className="flex space-x-2 items-center">
            {readOnly && (
              <div className="mr-2 px-3 py-1 bg-yellow-100 border border-yellow-300 rounded-md">
                <span className="text-xs font-semibold text-yellow-800">Read-Only</span>
              </div>
            )}
            {!readOnly && (
              <>
                <button
                  onClick={handleAddNewRow}
                  className="flex items-center px-3 py-2 text-sm text-white rounded-md transition-colors"
                  style={{ backgroundColor: '#6A7E76' }}
                  title="Add new row"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </button>
                <button
                  onClick={handleOpenUploadSheet}
                  className="flex items-center px-3 py-2 text-sm text-white rounded-md transition-colors"
                  style={{ backgroundColor: '#6A7E76' }}
                  title="Upload image to scan new materials"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Image
                </button>
              </>
            )}
            {hasUnsavedChanges && selectedRows.size === 0 && onSaveChanges && !readOnly && (
              <button
                onClick={handleSaveChanges}
                className="flex items-center px-3 py-2 text-sm text-white rounded-md transition-colors"
                style={{ backgroundColor: '#6A7E76' }}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </button>
            )}
            <button
              onClick={copyToClipboard}
              className="flex items-center px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center px-3 py-2 text-sm text-white rounded-md transition-colors"
              style={{ backgroundColor: '#6A7E76' }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </button>
            <button
              onClick={exportToExcel}
              className="flex items-center px-3 py-2 text-sm text-white rounded-md transition-colors"
              style={{ backgroundColor: '#6A7E76' }}
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export Excel
            </button>
          </div>
        </div>
        {selectedRows.size > 0 && !readOnly && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Select box to edit material</strong> - {selectedRows.size} row(s) selected for editing
            </p>
          </div>
        )}
        {readOnly && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Read-Only Mode:</strong> This project is shared with you. You can view and export, but cannot make changes.
            </p>
          </div>
        )}
      </div>
      
      {/* Filter Bar */}
      <div className="border-t border-black px-6 py-3" style={{ backgroundColor: '#42504A' }}>
        <div className="flex flex-wrap gap-2">
          {availableCategories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveFilter(category)}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                activeFilter === category
                  ? 'bg-gray-800 text-white font-semibold'
                  : 'bg-transparent text-white hover:opacity-80'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      
      <div className="border-b border-gray-200"></div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead style={{ backgroundColor: '#90AAA1' }}>
            <tr>
              <th className="px-3 py-3 text-left text-sm font-medium text-white w-12">
                {!readOnly && (
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={selectedRows.size === sortedMaterials.length && sortedMaterials.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRows(new Set(sortedMaterials.map((_, i) => i)));
                      } else {
                        setSelectedRows(new Set());
                      }
                    }}
                  />
                )}
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium text-white min-w-[100px]">
                Code
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium text-white min-w-[120px]">
                Area
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium text-white min-w-[180px]">
                Location of Finish
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium text-white min-w-[100px]">
                Material
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium text-white min-w-[320px]">
                Recommended Supplier
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium text-white min-w-[100px]">
                Price
              </th>
              {!readOnly && (
                <th className="px-3 py-3 text-left text-sm font-medium text-white w-12">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody ref={tableBodyRef} className="bg-white divide-y divide-gray-200">
            {sortedMaterials.map((item, filteredIndex) => {
              // Find the actual index in editedMaterials by code
              const actualIndex = editedMaterials.findIndex(m => m.code === item.code);
              const displayIndex = actualIndex >= 0 ? actualIndex : filteredIndex;
              const isSelected = selectedRows.has(filteredIndex);
              const isEditable = isSelected;
              const displayItem = actualIndex >= 0 ? editedMaterials[actualIndex] : item;
              
              const isStrikethrough = 
                (displayItem.type === 'Timber' && !['WD-01', 'WD-02', 'WD-03'].includes(displayItem.code)) ||
                (displayItem.type === 'Ceramic Tiles' && !['CT-01', 'CT-02', 'CT-03'].includes(displayItem.code));

              // Disable editing if read-only mode
              const canEdit = isEditable && actualIndex >= 0 && !readOnly;

              return (
                <tr key={`${item.code}-${filteredIndex}`} className={`hover:bg-gray-50 ${isSelected && !readOnly ? 'bg-blue-50' : ''} ${isStrikethrough ? 'strikethrough' : ''}`}>
                  <td className="px-3 py-4">
                    {!readOnly && (
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        checked={isSelected}
                        onChange={() => toggleRowSelection(filteredIndex)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-4 text-sm font-medium text-gray-900">
                    {canEdit ? (
                      <input
                        type="text"
                        value={displayItem.code || ''}
                        onChange={(e) => handleMaterialUpdate(actualIndex, 'code', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500 font-medium"
                      />
                    ) : (
                      displayItem.code
                    )}
                  </td>
                  <td className="px-3 py-4 text-sm text-gray-900">
                    {canEdit ? (
                      <input
                        type="text"
                        value={displayItem.area || ''}
                        onChange={(e) => handleMaterialUpdate(actualIndex, 'area', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                      />
                    ) : (
                      displayItem.area
                    )}
                  </td>
                  <td className="px-3 py-4 text-sm text-gray-900">
                    {canEdit ? (
                      <input
                        type="text"
                        value={displayItem.location || ''}
                        onChange={(e) => handleMaterialUpdate(actualIndex, 'location', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                      />
                    ) : (
                      displayItem.location
                    )}
                  </td>
                  <td className="px-3 py-4 text-sm text-gray-900">
                    {canEdit ? (
                      <input
                        type="text"
                        value={displayItem.type || ''}
                        onChange={(e) => handleMaterialUpdate(actualIndex, 'type', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                      />
                    ) : (
                      displayItem.type
                    )}
                  </td>
                  <td className="px-3 py-4 text-sm text-gray-900">
                    {canEdit ? (
                      <textarea
                        value={displayItem.supplierAndContact || ''}
                        onChange={(e) => handleMaterialUpdate(actualIndex, 'supplierAndContact', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500 resize-none"
                        rows={2}
                      />
                    ) : (
                      displayItem.supplierAndContact
                    )}
                  </td>
                  <td className="px-3 py-4 text-sm text-gray-900">
                    {canEdit ? (
                      <div className="space-y-1">
                        <div className="flex items-center space-x-1">
                          <span className="text-xs">Low:</span>
                          <input
                            type="number"
                            value={displayItem.pricePerSqm?.low || ''}
                            onChange={(e) => handlePriceUpdate(actualIndex, 'low', e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="text-xs">Mid:</span>
                          <input
                            type="number"
                            value={displayItem.pricePerSqm?.mid || ''}
                            onChange={(e) => handlePriceUpdate(actualIndex, 'mid', e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="text-xs">High:</span>
                          <input
                            type="number"
                            value={displayItem.pricePerSqm?.high || ''}
                            onChange={(e) => handlePriceUpdate(actualIndex, 'high', e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div>Low: {displayItem.pricePerSqm?.low ? `£${displayItem.pricePerSqm.low}` : '-'}</div>
                        <div>Mid: {displayItem.pricePerSqm?.mid ? `£${displayItem.pricePerSqm.mid}` : '-'}</div>
                        <div>High: {displayItem.pricePerSqm?.high ? `£${displayItem.pricePerSqm.high}` : '-'}</div>
                      </div>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-4 text-sm">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRow(filteredIndex);
                        }}
                        className="p-1 rounded transition-colors text-red-600 hover:bg-red-50"
                        title="Delete row"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Upload Sheet - appears below the schedule */}
      {showUploadSheet && (
        <div ref={uploadSheetRef} className="mt-6 border-t-2 border-gray-300 pt-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-semibold text-gray-900">Scan New Materials</h4>
            <button
              onClick={handleCloseUploadSheet}
              className="p-2 rounded transition-colors text-gray-600 hover:bg-gray-100"
              title="Close upload sheet"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Upload Area */}
          {!uploadedImage && !isScanning && (
            <div className="mb-6">
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700 mb-1">
                  {isDragOver ? 'Drop image here' : 'Click to upload or drag and drop'}
                </p>
                <p className="text-xs text-gray-500">
                  Supports JPG, PNG, and other image formats
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        const compressedFile = await compressImage(file);
                        handleImageSelect(compressedFile);
                      } catch (error) {
                        console.error("Image compression failed:", error);
                        handleImageSelect(file);
                      }
                    }
                  }}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* Loading State */}
          {isScanning && (
            <div className="mb-6 p-6 bg-gray-50 rounded-lg text-center">
              <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" style={{ color: '#42504A' }} />
              <p className="text-sm text-gray-600">Scanning image and generating materials...</p>
            </div>
          )}

          {/* Scanned Materials Preview */}
          {scannedMaterials.length > 0 && !isScanning && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm font-medium text-gray-700">
                  Select materials to append to current project ({selectedScannedMaterials.size} selected)
                </p>
                <button
                  onClick={handleAppendSelectedMaterials}
                  disabled={selectedScannedMaterials.size === 0}
                  className="flex items-center px-4 py-2 text-sm text-white rounded-md transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#42504A' }}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Append Selected ({selectedScannedMaterials.size})
                </button>
              </div>

              {/* Compact Preview Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 bg-white rounded-lg">
                  <thead style={{ backgroundColor: '#90AAA1' }}>
                    <tr>
                      <th className="px-2 py-2 text-left text-xs font-medium text-white w-8">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={selectedScannedMaterials.size === scannedMaterials.length && scannedMaterials.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedScannedMaterials(new Set(scannedMaterials.map((_, i) => i)));
                            } else {
                              setSelectedScannedMaterials(new Set());
                            }
                          }}
                        />
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-white">Code</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-white">Area</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-white">Location</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-white">Material</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-white">Supplier</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-white">Price</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {scannedMaterials.map((item, index) => {
                      const isSelected = selectedScannedMaterials.has(index);
                      return (
                        <tr
                          key={`scanned-${index}`}
                          className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                        >
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300"
                              checked={isSelected}
                              onChange={() => toggleScannedMaterialSelection(index)}
                            />
                          </td>
                          <td className="px-2 py-2 text-xs font-medium text-gray-900">{item.code}</td>
                          <td className="px-2 py-2 text-xs text-gray-700">{item.area}</td>
                          <td className="px-2 py-2 text-xs text-gray-700">{item.location}</td>
                          <td className="px-2 py-2 text-xs text-gray-700">{item.type || '-'}</td>
                          <td className="px-2 py-2 text-xs text-gray-700 max-w-xs truncate">{item.supplierAndContact || '-'}</td>
                          <td className="px-2 py-2 text-xs text-gray-700">
                            <div className="text-xs">
                              {item.pricePerSqm?.low ? `£${item.pricePerSqm.low}` : '-'} / 
                              {item.pricePerSqm?.mid ? `£${item.pricePerSqm.mid}` : '-'} / 
                              {item.pricePerSqm?.high ? `£${item.pricePerSqm.high}` : '-'}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* No materials message */}
          {uploadedImage && scannedMaterials.length === 0 && !isScanning && (
            <div className="p-6 bg-yellow-50 rounded-lg text-center">
              <p className="text-sm text-yellow-800">No materials found in the scanned image. Please try a different image.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MaterialSchedule;

