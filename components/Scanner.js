"use client";
import { useEffect, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function Scanner({ onScan }) {
  const [error, setError] = useState(null);

  useEffect(() => {
    const qr = new Html5Qrcode("reader");
    qr.start(
      { facingMode: "environment" },
      { fps: 12, qrbox: { width: 220, height: 100 } },
      (text) => qr.stop().then(() => onScan(text)).catch(() => {}),
      () => {}
    ).catch(() => setError("Włącz uprawnienia do aparatu."));

    return () => {
      try { qr.stop().catch(() => {}); } catch {}
    };
  }, [onScan]);

  return (
    <div className="w-full max-w-md mx-auto text-center">
      <div id="reader" className="w-full h-[180px] max-h-[180px] rounded-xl overflow-hidden border-2 border-blue-500 bg-black"></div>
      {error && <p className="text-rose-400 text-xs mt-1 font-bold">{error}</p>}
    </div>
  );
}
