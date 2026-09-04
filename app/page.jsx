"use client";
import { useState, useEffect } from "react";
import Scanner from "../components/Scanner";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [ean, setEan] = useState(null);
  const [manualEan, setManualEan] = useState("");
  const [product, setProduct] = useState(null);
  const [customName, setCustomName] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [price, setPrice] = useState("");
  const [isRecommended, setIsRecommended] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [sortOrder, setSortOrder] = useState("newest");
  const [recentScans, setRecentScans] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Wczytanie historii ostatnich skanów z localStorage
  useEffect(() => {
    const saved = localStorage.getItem("recent_scans");
    if (saved) setRecentScans(JSON.parse(saved));
  }, []);

  const saveToRecent = (scannedEan, name) => {
    const updated = [{ ean: scannedEan, name }, ...recentScans.filter((i) => i.ean !== scannedEan)].slice(0, 5);
    setRecentScans(updated);
    localStorage.setItem("recent_scans", JSON.stringify(updated));
  };

  const fetchReviews = async (targetEan) => {
    setLoadingReviews(true);
    const { data } = await supabase
      .from("reviews")
      .select("id, rating, comment, price, is_recommended, custom_name, created_at")
      .eq("ean", targetEan)
      .order("created_at", { ascending: false });

    if (data) setReviews(data);
    setLoadingReviews(false);
  };

  const loadProductData = async (targetEan) => {
    if (navigator.vibrate) navigator.vibrate(100);
    setEan(targetEan);

    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${targetEan}.json`);
      const data = await res.json();
      const pName = data.status === 1 ? data.product.product_name : "Nieznany produkt";
      setProduct(data.status === 1 ? data.product : { product_name: pName, image_url: "" });
      setCustomName("");
      saveToRecent(targetEan, pName);
    } catch {
      setProduct({ product_name: "Nieznany produkt", image_url: "" });
      saveToRecent(targetEan, "Nieznany produkt");
    }

    await fetchReviews(targetEan);
  };

  const saveReview = async () => {
    setIsSubmitting(true);
    const payload = {
      ean,
      rating,
      comment: comment.trim() || null,
      price: price ? parseFloat(price) : null,
      is_recommended: isRecommended,
      custom_name: product?.product_name === "Nieznany produkt" && customName.trim() ? customName.trim() : null,
    };

    const { error } = await supabase.from("reviews").insert([payload]);
    setIsSubmitting(false);

    if (error) {
      alert("Błąd zapisu!");
    } else {
      alert("Zapisano!");
      setComment("");
      setPrice("");
      await fetchReviews(ean);
    }
  };

  const copyShareInfo = () => {
    const text = `Sprawdź produkt: ${product?.product_name || customName || "EAN: " + ean} (Średnia: ${averageRating || "brak"} ★)`;
    navigator.clipboard.writeText(text);
    alert("Skopiowano informację do schowka!");
  };

  const averageRating = reviews.length
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  const recommendPercent = reviews.length
    ? Math.round((reviews.filter((r) => r.is_recommended).length / reviews.length) * 100)
    : null;

  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortOrder === "highest") return b.rating - a.rating;
    if (sortOrder === "lowest") return a.rating - b.rating;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <main className="min-h-screen p-4 flex flex-col items-center bg-gray-50 text-black">
      <h1 className="text-2xl font-bold mb-4">Skaner Produktów</h1>

      {!ean && (
        <div className="w-full max-w-md flex flex-col gap-4">
          <Scanner onScan={loadProductData} />

          {/* Ręczne wpisywanie EAN */}
          <div className="bg-white p-4 rounded-lg shadow-sm border flex gap-2">
            <input
              type="text"
              placeholder="Wpisz kod EAN ręcznie..."
              value={manualEan}
              onChange={(e) => setManualEan(e.target.value)}
              className="border p-2 rounded flex-1 text-sm outline-none"
            />
            <button
              onClick={() => manualEan && loadProductData(manualEan.trim())}
              className="bg-blue-600 text-white px-4 rounded text-sm font-semibold"
            >
              Szukaj
            </button>
          </div>

          {/* Ostatnio skanowane */}
          {recentScans.length > 0 && (
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Ostatnio sprawdzane</h4>
              <div className="flex flex-col gap-1">
                {recentScans.map((item) => (
                  <button
                    key={item.ean}
                    onClick={() => loadProductData(item.ean)}
                    className="text-left text-sm text-blue-600 hover:underline truncate"
                  >
                    {item.name} ({item.ean})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {product && (
        <div className="w-full max-w-md flex flex-col gap-4">
          {/* Karta Główna */}
          <div className="bg-white p-6 rounded-lg shadow-md flex flex-col items-center">
            {product.image_url && (
              <img src={product.image_url} alt="Produkt" className="w-32 h-32 object-contain mb-3" />
            )}

            <h2 className="text-xl font-bold text-center">
              {product.product_name === "Nieznany produkt" && customName ? customName : product.product_name}
            </h2>
            <p className="text-gray-400 text-xs mb-3">EAN: {ean}</p>

            {/* Własna nazwa dla nieznanych */}
            {product.product_name === "Nieznany produkt" && (
              <input
                type="text"
                placeholder="Wpisz poprawną nazwę produktu..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full border p-2 rounded text-sm mb-3 bg-yellow-50 border-yellow-300"
              />
            )}

            {/* Statystyki */}
            <div className="grid grid-cols-2 gap-2 w-full mb-4">
              <div className="bg-blue-50 border border-blue-100 rounded p-2 text-center">
                <span className="text-xl font-bold text-blue-600">{averageRating || "-"}</span>
                <span className="text-xs text-gray-500"> / 5 ★</span>
                <p className="text-[10px] text-gray-400">Opinie: {reviews.length}</p>
              </div>
              <div className="bg-green-50 border border-green-100 rounded p-2 text-center">
                <span className="text-xl font-bold text-green-600">
                  {recommendPercent !== null ? `${recommendPercent}%` : "-"}
                </span>
                <p className="text-[10px] text-gray-400">poleca ten produkt</p>
              </div>
            </div>

            {/* Formularz Dodawania */}
            <div className="flex gap-2 mb-3">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setRating(num)}
                  className={`w-9 h-9 text-xl rounded-full ${
                    rating >= num ? "bg-yellow-400 text-white" : "bg-gray-200 text-gray-400"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>

            <div className="flex gap-2 w-full mb-3">
              <input
                type="number"
                step="0.01"
                placeholder="Cena (zł)"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-1/2 border p-2 rounded text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => setIsRecommended(!isRecommended)}
                className={`w-1/2 border rounded text-xs font-bold transition-colors ${
                  isRecommended ? "bg-green-100 border-green-400 text-green-700" : "bg-red-100 border-red-400 text-red-700"
                }`}
              >
                {isRecommended ? "👍 Polecam" : "👎 Odradzam"}
              </button>
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Treść recenzji (opcjonalnie)..."
              rows={2}
              className="w-full border p-2 rounded mb-3 text-sm outline-none"
            />

            <button
              onClick={saveReview}
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white font-bold py-2 rounded text-sm disabled:opacity-50"
            >
              {isSubmitting ? "Zapisywanie..." : "Zapisz recenzję"}
            </button>

            <div className="flex justify-between w-full mt-4 text-xs">
              <button onClick={copyShareInfo} className="text-blue-600 underline">
                Udostępnij produkt
              </button>
              <button
                onClick={() => {
                  setEan(null);
                  setProduct(null);
                }}
                className="text-gray-500 underline"
              >
                Skanuj inny
              </button>
            </div>
          </div>

          {/* Lista Recenzji */}
          <div className="bg-white p-4 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-sm">Opinie ({reviews.length})</h3>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="text-xs border p-1 rounded"
              >
                <option value="newest">Najnowsze</option>
                <option value="highest">Najwyższa ocena</option>
                <option value="lowest">Najniższa ocena</option>
              </select>
            </div>

            {loadingReviews && <p className="text-xs text-gray-400">Pobieranie...</p>}

            <div className="flex flex-col gap-3">
              {sortedReviews.map((rev) => (
                <div key={rev.id} className="border-b pb-2 last:border-0 text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-yellow-500 font-bold">{"★".repeat(rev.rating)}</span>
                    <span className="text-gray-400">{new Date(rev.created_at).toLocaleDateString("pl-PL")}</span>
                  </div>
                  <div className="flex gap-2 text-[11px] text-gray-500 mb-1">
                    <span>{rev.is_recommended ? "👍 Poleca" : "👎 Odradza"}</span>
                    {rev.price && <span>• Zakupiono za: {rev.price} zł</span>}
                  </div>
                  {rev.comment && <p className="text-gray-700">{rev.comment}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
