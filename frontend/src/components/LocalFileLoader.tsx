import { useId, useState } from 'react';
import { FileBox, FolderOpen, FlaskConical, Play } from 'lucide-react';
import { LOCAL_RVM_ACCEPT } from '../viewer/localModel.js';

interface LocalFileLoaderProps {
  maxFileBytes: number;
  onLoad: (model: File) => Promise<void>;
  onLoadTest: () => Promise<void>;
  showTestModel: boolean;
}

export function LocalFileLoader({
  maxFileBytes,
  onLoad,
  onLoadTest,
  showTestModel,
}: LocalFileLoaderProps): React.JSX.Element {
  const modelId = useId();
  const [model, setModel] = useState<File>();
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!model) {
      setMessage('请选择一个 .rvm 文件');
      return;
    }
    await run(() => onLoad(model));
  };

  const run = async (action: () => Promise<void>): Promise<void> => {
    setLoading(true);
    setMessage(undefined);
    try {
      await action();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="rv-local-loader" onSubmit={submit} aria-label="RVM 文件加载">
      <div className="rv-local-loader__heading">
        <FileBox aria-hidden="true" size={18} strokeWidth={1.8} />
        <div>
          <div className="rv-local-loader__eyebrow">本地文件</div>
          <div className="rv-local-loader__title">加载 RVM</div>
        </div>
      </div>
      <label className="rv-file-picker" htmlFor={modelId}>
        <FolderOpen aria-hidden="true" size={17} strokeWidth={1.8} />
        <span title={model?.name}>{model?.name ?? '选择 RVM 文件'}</span>
      </label>
      <input
        id={modelId}
        className="rv-file-picker__input"
        type="file"
        accept={LOCAL_RVM_ACCEPT}
        onChange={(event) => setModel(event.currentTarget.files?.item(0) ?? undefined)}
      />
      <div className="rv-local-loader__hint">单个 .rvm 文件 · 最大 {formatMegabytes(maxFileBytes)} MB</div>
      {message ? <div className="rv-local-loader__message">{message}</div> : null}
      <div className="rv-local-loader__actions">
        <button className="rv-command rv-command--primary" type="submit" disabled={loading}>
          <Play aria-hidden="true" size={16} fill="currentColor" strokeWidth={1.8} />
          {loading ? '正在加载…' : '加载所选 RVM'}
        </button>
        {showTestModel ? (
          <button
            className="rv-command"
            type="button"
            disabled={loading}
            onClick={() => void run(onLoadTest)}
          >
            <FlaskConical aria-hidden="true" size={16} strokeWidth={1.8} />
            加载测试 RVM
          </button>
        ) : null}
      </div>
    </form>
  );
}

function formatMegabytes(bytes: number): string {
  return String(Math.round(bytes / 1024 / 1024));
}
