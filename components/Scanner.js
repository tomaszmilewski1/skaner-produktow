"use client";
import { useEffect, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function Scanner({ onScan }) {
  const [error, setError] = useState(null);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("reader");

    // Uruchomienie skanera z wymuszonym tylnym aparatem
    html5QrCode.start(
      { facingMode: "environment" }, 
      { fps: 10, qrbox: { width: 250, height: 150 } },
      (decodedText) => {
        // Po udanym skanie wyłącz aparat i przekaż kod EAN
        html5QrCode.stop().then(() => onScan(decodedText)).catch(() => {});
      },
      () => {} // Ignorujemy puste klatki
    ).catch((err) => {
      setError("Nie udało się uruchomić aparatu. Sprawdź uprawnienia w przeglądarce.");
    });

    // Czyszczenie przy wyjściu
    return () => {
      try {
        html5QrCode.stop().catch(() => {});
      } catch (e) {}
    };
  }, [onScan]);

  return (
    <div className="w-full max-w-md mx-auto text-center flex flex-col items-center">
      <p className="font-bold text-gray-700 mb-2">Trwa uruchamianie tylnego aparatu...</p>
      <div id="reader" className="w-full rounded-lg overflow-hidden border-2 border-blue-400 bg-black min-h-[250px]"></div>
      {error && <p className="text-red-500 text-sm mt-2 font-bold">{error}</p>}
      <p className="text-gray-500 text-sm mt-4">Nakieruj aparat na kod kreskowy (EAN) produktu spożywczego.</p>
    </div>
  );
}
