export function ErrorOverlay({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="rv-error" role="alert">
      <div>{message}</div>
    </div>
  );
}
