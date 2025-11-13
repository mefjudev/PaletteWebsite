'use client';

import { useState, useEffect, useMemo } from 'react';
import { BIMItem } from '@/lib/types/bim';
import { Download, Copy, Save, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';

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
              <button
                onClick={handleAddNewRow}
                className="flex items-center px-3 py-2 text-sm text-white rounded-md transition-colors"
                style={{ backgroundColor: '#6A7E76' }}
                title="Add new row"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add
              </button>
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
          <tbody className="bg-white divide-y divide-gray-200">
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
    </div>
  );
};

export default MaterialSchedule;

