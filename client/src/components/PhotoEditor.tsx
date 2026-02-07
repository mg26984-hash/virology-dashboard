import { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { RotateCw, RotateCcw, Check, X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

interface PhotoEditorProps {
  imageSrc: string;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
  fileName?: string;
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const radians = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));

  // Calculate bounding box of the rotated image
  const bBoxWidth = image.width * cos + image.height * sin;
  const bBoxHeight = image.width * sin + image.height * cos;

  // Set canvas size to the crop area
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Translate and rotate
  ctx.translate(-pixelCrop.x, -pixelCrop.y);
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(radians);
  ctx.translate(-image.width / 2, -image.height / 2);

  ctx.drawImage(image, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/jpeg",
      0.92
    );
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (err) => reject(err));
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

export default function PhotoEditor({ imageSrc, onConfirm, onCancel, fileName }: PhotoEditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleRotateRight = () => setRotation((prev) => (prev + 90) % 360);
  const handleRotateLeft = () => setRotation((prev) => (prev - 90 + 360) % 360);
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.2, 5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.2, 1));
  const handleResetZoom = () => { setZoom(1); setRotation(0); setCrop({ x: 0, y: 0 }); };

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      const outputName = fileName || "photo.jpg";
      const file = new File([blob], outputName, { type: "image/jpeg" });
      onConfirm(file);
    } catch (err) {
      console.error("Crop failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-white hover:bg-white/20"
        >
          <X className="h-5 w-5 mr-1" />
          Cancel
        </Button>
        <p className="text-white/80 text-sm font-medium">Edit Photo</p>
        <Button
          variant="default"
          size="sm"
          onClick={handleConfirm}
          disabled={isProcessing}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isProcessing ? (
            <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full mr-1" />
          ) : (
            <Check className="h-5 w-5 mr-1" />
          )}
          {isProcessing ? "Processing..." : "Apply"}
        </Button>
      </div>

      {/* Cropper area */}
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={undefined}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onCropComplete}
          showGrid={true}
          style={{
            containerStyle: { background: "#111" },
          }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 px-4 py-3 bg-black/50 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRotateLeft}
          className="text-white hover:bg-white/20 h-10 w-10"
          title="Rotate left 90°"
        >
          <RotateCcw className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRotateRight}
          className="text-white hover:bg-white/20 h-10 w-10"
          title="Rotate right 90°"
        >
          <RotateCw className="h-5 w-5" />
        </Button>

        <div className="w-px h-6 bg-white/20 mx-1" />

        <Button
          variant="ghost"
          size="icon"
          onClick={handleZoomOut}
          className="text-white hover:bg-white/20 h-10 w-10"
          title="Zoom out"
          disabled={zoom <= 1}
        >
          <ZoomOut className="h-5 w-5" />
        </Button>
        <span className="text-white/70 text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleZoomIn}
          className="text-white hover:bg-white/20 h-10 w-10"
          title="Zoom in"
          disabled={zoom >= 5}
        >
          <ZoomIn className="h-5 w-5" />
        </Button>

        <div className="w-px h-6 bg-white/20 mx-1" />

        <Button
          variant="ghost"
          size="icon"
          onClick={handleResetZoom}
          className="text-white hover:bg-white/20 h-10 w-10"
          title="Reset"
        >
          <Maximize2 className="h-5 w-5" />
        </Button>

        <span className="text-white/50 text-xs ml-2 hidden sm:inline">
          {rotation > 0 ? rotation + "°" : ""}
        </span>
      </div>
    </div>
  );
}
