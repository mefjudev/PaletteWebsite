'use client';

import { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { compressImage } from '@/lib/utils/imageCompressor';

interface ImageUploadProps {
  onImageSelect: (file: File) => void;
  selectedImage: File | null;
  onRemoveImage: () => void;
}

export default function ImageUpload({ onImageSelect, selectedImage, onRemoveImage }: ImageUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));
    
    if (imageFile) {
      try {
        const compressedFile = await compressImage(imageFile);
        onImageSelect(compressedFile);
      } catch (error) {
        console.error("Image compression failed:", error);
        onImageSelect(imageFile);
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      try {
        const compressedFile = await compressImage(file);
        onImageSelect(compressedFile);
      } catch (error) {
        console.error("Image compression failed:", error);
        onImageSelect(file);
      }
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      {selectedImage ? (
        <div className="relative">
          <div className="border-2 border-dashed border-green-500 rounded-lg p-6"
               style={{ backgroundColor: '#F0FDF4' }}>
            <div className="flex items-center justify-center mb-4">
              <ImageIcon className="w-12 h-12" style={{ color: '#16A34A' }} />
            </div>
            <p className="text-center font-medium mb-2" style={{ color: '#15803D' }}>
              {selectedImage.name}
            </p>
            <p className="text-center text-sm" style={{ color: '#16A34A' }}>
              {(selectedImage.size / 1024 / 1024).toFixed(2)} MB (Compressed)
            </p>
            <button
              onClick={onRemoveImage}
              className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-blue-500'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            Upload an image
          </p>
          <p className="text-gray-500 mb-4">
            Drag and drop an image here, or click to select
          </p>
          <p className="text-sm text-gray-400">
            Supports JPG, PNG, and other image formats
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}

