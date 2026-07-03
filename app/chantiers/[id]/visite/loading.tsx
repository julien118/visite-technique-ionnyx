export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header sombre — ancre visuelle, même hauteur que les vraies pages */}
      <div className="bg-[#1A1A1A] h-[64px]" />
      {/* Spinner discret */}
      <div className="flex items-center justify-center pt-24">
        <div className="w-9 h-9 border-[3px] border-gray-200 border-t-[#10B981] rounded-full animate-spin" />
      </div>
    </div>
  );
}
