'use client';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDropzone } from 'react-dropzone';
import { z } from 'zod';
import imageCompression from 'browser-image-compression';
import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import ReactCrop, { Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const formSchema = z.object({
  cover_image: z
    .custom<File>()
    .refine((file) => file instanceof File, "Please upload a file")
    .refine((file) => file.size <= MAX_FILE_SIZE, `Max file size is 10MB.`)
    .refine(
      (file) => ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type),
      "Only .jpg, .jpeg, and .png formats are supported."
    )
});

export default function ImageUploader() {
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [compressedPreview, setCompressedPreview] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [targetWidth, setTargetWidth] = useState(600);
  const [targetHeight, setTargetHeight] = useState(400);
  const [crop, setCrop] = useState<Crop>({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cover_image: undefined,
    },
  });

  const cropImage = useCallback((image: HTMLImageElement, crop: Crop, fileName: string): Promise<File> => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        crop.width,
        crop.height
      );
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas is empty'));
            return;
          }
          resolve(new File([blob], fileName, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        1
      );
    });
  }, []);

  const resizeImage = useCallback((file: File, width: number, height: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.onload = () => {
          const canvas = canvasRef.current!;
          const ctx = canvas.getContext('2d')!;

          const imageAspectRatio = img.width / img.height;
          const targetAspectRatio = width / height;

          let drawWidth = width;
          let drawHeight = height;
          let offsetX = 0;
          let offsetY = 0;

          if (imageAspectRatio > targetAspectRatio) {
            drawHeight = width / imageAspectRatio;
            offsetY = (height - drawHeight) / 2;
          } else {
            drawWidth = height * imageAspectRatio;
            offsetX = (width - drawWidth) / 2;
          }

          canvas.width = width;
          canvas.height = height;

          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

          canvas.toBlob((blob) => {
            resolve(blob!);
          }, 'image/jpeg', 0.9);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const processImage = useCallback(async (file: File) => {
    if (!completedCrop || !imgRef.current) return;

    try {
      // Step 1: Crop the image
      const croppedFile = await cropImage(imgRef.current, completedCrop, file.name);

      // Step 2: Compress the cropped image
      const options = {
        maxSizeMB: 5,
        maxWidthOrHeight: Math.max(targetWidth, targetHeight),
        useWebWorker: true
      };
      const compressedFile = await imageCompression(croppedFile, options);

      // Step 3: Resize the compressed image
      const resizedBlob = await resizeImage(compressedFile, targetWidth, targetHeight);
      const resizedFile = new File([resizedBlob], file.name, { type: 'image/jpeg' });

      // Update state and form
      const reader = new FileReader();
      reader.onload = () => {
        setCompressedPreview(reader.result as string);
        setCompressedSize(resizedFile.size);
      };
      reader.readAsDataURL(resizedFile);

      form.setValue('cover_image', resizedFile);
      form.clearErrors('cover_image');
    } catch (error) {
      console.error('Error processing image:', error);
      setCompressedPreview(null);
      setCompressedSize(null);
      form.resetField('cover_image');
    }
  }, [completedCrop, targetWidth, targetHeight, cropImage, resizeImage, form]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      const reader = new FileReader();

      reader.onload = () => {
        setOriginalPreview(reader.result as string);
        setOriginalSize(file.size);
        form.setValue('cover_image', file);
      };
      reader.readAsDataURL(file);
    },
    [form]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
  });

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    console.log('Submitting form data:', data);
    // Here you would typically send the data to your server
    // For example:
    // const formData = new FormData();
    // formData.append('cover_image', data.cover_image);
    // await fetch('/api/upload', { method: 'POST', body: formData });
  };

  return (
    <div className='grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]'>
      <h1 className='text-3xl font-bold'>Image Upload and Compression</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="w-full max-w-2xl">
          <FormField
            name='cover_image'
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Image</FormLabel>
                <FormControl>
                  <div {...getRootProps()} className="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-4 cursor-pointer">
                    {isDragActive ? (
                      <p className="text-center">Drop the image here ...</p>
                    ) : (
                      <p className="text-center">Click to select one</p>
                    )}
                    <Input 
                      type='file' 
                      {...getInputProps()} 
                      className="hidden" 
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          field.onChange(file);
                          onDrop([file]);
                        }
                      }}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="target-width">Target Width (px)</Label>
              <Input
                id="target-width"
                type="number"
                value={targetWidth}
                onChange={(e) => setTargetWidth(Number(e.target.value))}
                className="mb-2"
              />
            </div>
            <div>
              <Label htmlFor="target-height">Target Height (px)</Label>
              <Input
                id="target-height"
                type="number"
                value={targetHeight}
                onChange={(e) => setTargetHeight(Number(e.target.value))}
                className="mb-2"
              />
            </div>
          </div>

          {originalPreview && (
            <div className="mb-4">
              <h3 className="font-bold mb-2">Crop Image</h3>
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={targetWidth / targetHeight}
              >
                <img ref={imgRef} src={originalPreview} alt="Original" style={{ maxWidth: '100%' }} />
              </ReactCrop>
              <Button onClick={() => processImage(form.getValues('cover_image'))} className="mt-2">
                Apply Crop and Compress
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-5">
            {originalPreview && (
              <div>
                <h3 className="font-bold mb-2">Original Image</h3>
                <div className={cn('w-full h-[24.6dvh] relative aspect-video')}>
                  <Image
                    src={originalPreview}
                    alt="Original preview"
                    fill
                    priority
                    className="object-contain rounded-md"
                  />
                </div>
                <p className="mt-2">Size: {(originalSize! / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            )}
            {compressedPreview && (
              <div>
                <h3 className="font-bold mb-2">Compressed & Resized Image</h3>
                <div className={cn('w-full h-[24.6dvh] relative aspect-video')}>
                  <Image
                    src={compressedPreview}
                    alt="Compressed preview"
                    fill
                    priority
                    className="object-cover rounded-md"
                  />
                </div>
                <p className="mt-2">Size: {(compressedSize! / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            )}
          </div>

          {compressedPreview && originalSize && compressedSize && (
            <div className="mt-4">
              <p>Compression ratio: {((1 - (compressedSize / originalSize)) * 100).toFixed(2)}%</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full mt-4"
            disabled={!form.getValues('cover_image')}
          >
            Upload Compressed & Resized Image
          </Button>
        </form>
      </Form>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}