export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-[100dvh] overflow-y-auto bg-white dark:bg-gray-950">
      {children}
    </div>
  );
}
