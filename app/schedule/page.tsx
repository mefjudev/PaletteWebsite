'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import ImageUpload from '@/components/ImageUpload';
import MaterialSchedule from '@/components/MaterialSchedule';
import { BIMItem } from '@/lib/types/bim';
import { Wand2, Loader2, ArrowLeft } from 'lucide-react';

export default function SchedulePage() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [materials, setMaterials] = useState<BIMItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/');
      } else {
        setIsAuthenticated(true);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleImageSelect = (file: File) => {
    setSelectedImage(file);
    setError(null);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setMaterials([]);
    setError(null);
  };

  const generateMaterials = async () => {
    if (!selectedImage) {
      setError('Please select an image first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', selectedImage);

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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{ backgroundColor: '#42504A' }}>
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-8 max-w-full lg:max-w-screen-2xl">
        {/* Back Button */}
        <button
          onClick={() => router.push('/dashboard')}
          className="mb-6 flex items-center text-white px-4 py-2 rounded-lg"
          style={{ backgroundColor: '#42504A' }}
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Dashboard
        </button>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Left Column - Upload */}
          <div className="space-y-6">
            <div className="rounded-lg shadow-md p-6" style={{ backgroundColor: '#42504A' }}>
              <h2 className="text-2xl font-semibold text-white mb-4 font-heading">
                Upload Image
              </h2>
              <ImageUpload
                onImageSelect={handleImageSelect}
                selectedImage={selectedImage}
                onRemoveImage={handleRemoveImage}
              />
            </div>

            {/* Generate Button */}
            <div className="rounded-lg shadow-md p-6" style={{ backgroundColor: '#42504A' }}>
              <button
                onClick={generateMaterials}
                disabled={!selectedImage || isLoading}
                className={`w-full flex items-center justify-center px-6 py-4 rounded-lg font-semibold text-lg transition-colors ${
                  !selectedImage || isLoading
                    ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    : 'bg-white text-gray-900 hover:bg-gray-100'
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                    Generating Materials...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-6 h-6 mr-3" />
                    Generate Materials
                  </>
                )}
              </button>
              
              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Info */}
          <div className="flex flex-col justify-center">
            <h1 className="text-4xl font-bold mb-4 text-gray-900 font-heading">
              Material Schedule Generator
            </h1>
            <p className="text-lg text-gray-600">
              Upload an image of your space and get a detailed material schedule 
              with supplier information and pricing.
            </p>
          </div>
        </div>

        {/* Material Schedule - Full Width Below */}
        <div className="w-full">
          <MaterialSchedule materials={materials} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}

