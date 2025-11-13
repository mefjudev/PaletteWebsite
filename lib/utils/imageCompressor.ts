export const compressImage = (file: File, maxWidth: number = 1024, maxHeight: number = 1024, quality: number = 0.8): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context'));
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Determine output format based on original file type or default to jpeg
        const outputFormat = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Canvas toBlob failed'));
            }
            const compressedFile = new File([blob], file.name, { type: outputFormat, lastModified: Date.now() });
            resolve(compressedFile);
          },
          outputFormat,
          quality
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

