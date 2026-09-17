import { useId, useState } from 'react';
import { LOCAL_ATTRIBUTE_ACCEPT, LOCAL_MODEL_ACCEPT } from '../viewer/localModel.js';

interface LocalFileLoaderProps {
  maxFileBytes: number;
  onLoad: (model: File, attributes?: File) => Promise<void>;
}

export function LocalFileLoader({ maxFileBytes, onLoad }: LocalFileLoaderProps): React.JSX.Element {
  const modelId = useId();
  const attributeId = useId();
  const [model, setModel] = useState<File>();
  const [attributes, setAttributes] = useState<File>();
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!model) {
      setMessage('请选择模型文件');
      return;
    }

    setLoading(true);
    setMessage(undefined);
    await onLoad(model, attributes);
    setLoading(false);
  };

  return (
    <form className="rv-local-loader" onSubmit={submit} aria-label="本地模型上传">
      <div className="rv-local-loader__title">本地预览</div>
      <label htmlFor={modelId}>模型文件</label>
      <input
        id={modelId}
        type="file"
        accept={LOCAL_MODEL_ACCEPT}
        onChange={(event) => setModel(event.currentTarget.files?.item(0) ?? undefined)}
      />
      <label htmlFor={attributeId}>RVM 属性（可选）</label>
      <input
        id={attributeId}
        type="file"
        accept={LOCAL_ATTRIBUTE_ACCEPT}
        onChange={(event) => setAttributes(event.currentTarget.files?.item(0) ?? undefined)}
      />
      <div className="rv-local-loader__hint">
        支持 OBJ、STL、RVM；单文件最多 {formatMegabytes(maxFileBytes)} MB
      </div>
      {message ? <div className="rv-local-loader__message">{message}</div> : null}
      <button type="submit" disabled={loading}>
        {loading ? '正在加载…' : '加载模型'}
      </button>
    </form>
  );
}

function formatMegabytes(bytes: number): string {
  return String(Math.round(bytes / 1024 / 1024));
}
