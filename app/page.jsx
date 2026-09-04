"use client";
import { useState } from "react";
import Scanner from "../components/Scanner";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [ean, setEan] = useState(null);
  const [product, setProduct] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviews, setReviews] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Pobieranie opinii z Supabase dla konkretnego kodu EAN
  const fetchReviews = async (scannedEan) => {
    setLoadingReviews(true);
    const { data, error } = await supabase
      .from("reviews")
      .select("id, rating, comment, created_at")
      .eq("ean", scannedEan)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setReviews(data);
    }
    setLoadingReviews(false);
  };

  // Obsługa zeskanowania produktu
  const handleScan = async (scannedEan) => {
    setEan(scannedEan);

    // 1. Pobieranie danych z Open Food Facts
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${scannedEan}.json`);
    const data = await res.json();
    setProduct(data.status === 1 ? data.product : { product_name: "Nieznany produkt", image_url: "" });

    // 2. Pobieranie dotychczasowych opinii z Supabase
    await fetchReviews(scannedEan);
  };

  // Zapisywanie nowej oceny
  const saveRating = async () => {
    setIsSubmitting(true);
    const { error } = await supabase
      .from("reviews")
      .insert([{ ean, rating, comment: comment.trim() || null }]);

    setIsSubmitting(false);

    if (error) {
      alert("Błąd zapisu!");
    } else {
      alert("Ocena i recenzja zostały zapisane!");
      setComment("");
      // Odświeżenie listy opinii i średniej
      await fetchReviews(ean);
    }
  };

  // Obliczanie średniej ocen
  const averageRating =
    reviews.length > 0
      ? (reviews.reduce((acc, item) => acc + item.rating, 0) / reviews.length).toFixed(1)
      : null;

  return (
    <main className="min-h-screen p-4 flex flex-col items-center bg-gray-50 text-black">
      <h1 className="text-2xl font-bold mb-6">Skaner Produktów</h1>

      {!ean && <Scanner onScan={handleScan} />}

      {product && (
        <div className="w-full max-w-md flex flex-col gap-4">
          {/* Karta produktu i formularz oceniania */}
          <div className="bg-white p-6 rounded-lg shadow-md flex flex-col items-center w-full">
            {product.image_url && (
              <img src={product.image_url} alt="Zdjęcie produktu" className="w-32 h-32 object-contain mb-4" />
            )}
            <h2 className="text-xl font-bold text-center">{product.product_name}</h2>
            <p className="text-gray-500 mb-2 text-sm">EAN: {ean}</p>

            {/* Podsumowanie ocen społeczności */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 w-full my-3 text-center">
              {averageRating ? (
                <div>
                  <span className="text-2xl font-extrabold text-blue-600">{averageRating}</span>
                  <span className="text-gray-500 text-sm"> / 5 ★</span>
                  <p className="text-xs text-gray-500 mt-1">Liczba opinii: {reviews.length}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Brak ocen. Bądź pierwszą osobą, która oceni ten produkt!</p>
              )}
            </div>

            {/* Wybór gwiazdek */}
            <div className="flex gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setRating(num)}
                  className={`w-10 h-10 text-2xl pb-1 rounded-full transition-colors ${
                    rating >= num ? "bg-yellow-400 text-white" : "bg-gray-200 text-gray-400"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>

            {/* Komentarz */}
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Napisz swoją opinię o produkcie (opcjonalnie)..."
              rows={3}
              className="w-full p-2 border border-gray-300 rounded mb-4 text-sm focus:outline-none focus:border-blue-500"
            />

            <button
              onClick={saveRating}
              disabled={isSubmitting}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Zapisywanie..." : "Zapisz recenzję"}
            </button>

            <button
              onClick={() => {
                setEan(null);
                setProduct(null);
                setComment("");
                setReviews([]);
              }}
              className="mt-3 text-sm text-gray-500 underline"
            >
              Skanuj inny produkt
            </button>
          </div>

          {/* Sekcja z listą opinii */}
          <div className="bg-white p-6 rounded-lg shadow-md w-full">
            <h3 className="font-bold text-lg mb-3">Opinie użytkowników</h3>

            {loadingReviews && <p className="text-sm text-gray-500">Wczytywanie opinii...</p>}

            {!loadingReviews && reviews.length === 0 && (
              <p className="text-sm text-gray-400">Ten produkt nie ma jeszcze recenzji.</p>
            )}

            <div className="flex flex-col gap-3">
              {reviews.map((rev) => (
                <div key={rev.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-yellow-500 font-bold text-sm">{"★".repeat(rev.rating)}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(rev.created_at).toLocaleDateString("pl-PL")}
                    </span>
                  </div>
                  {rev.comment ? (
                    <p className="text-sm text-gray-700">{rev.comment}</p>
                  ) : (
                    <p className="text-xs italic text-gray-400">Brak komentarza tekstowego</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
