import { Box, Maximize2 } from 'lucide-react';

interface CameraToolbarProps {
  disabled: boolean;
  onFrame: () => void;
  onReset: () => void;
}

export function CameraToolbar({ disabled, onFrame, onReset }: CameraToolbarProps): React.JSX.Element {
  return (
    <nav className="rv-camera-tools" aria-label="相机控制">
      <button
        type="button"
        aria-label="按当前视角适配模型"
        title="按当前视角适配模型"
        disabled={disabled}
        onClick={onFrame}
      >
        <Maximize2 aria-hidden="true" size={17} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label="恢复等轴视图"
        title="恢复等轴视图"
        disabled={disabled}
        onClick={onReset}
      >
        <Box aria-hidden="true" size={17} strokeWidth={1.8} />
      </button>
    </nav>
  );
}
