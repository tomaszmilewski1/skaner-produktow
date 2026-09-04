"use client";
import { useState, useEffect } from "react";
import Scanner from "../components/Scanner";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");

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

  // Widoki: 'scan' lub 'profile'
  const [activeTab, setActiveTab] = useState("scan");
  const [userReviews, setUserReviews] = useState([]);
  const [darkMode, setDarkMode] = useState(false);

  // Inicjalizacja sesji i autoryzacji
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    const saved = localStorage.getItem("recent_scans");
    if (saved) setRecentScans(JSON.parse(saved));

    return () => subscription.unsubscribe();
  }, []);

  // Logowanie Magic Linkiem
  const handleAuth = async (e) => {
    e.preventDefault();
    if (!authEmail) return;
    setAuthMessage("Wysyłanie linku...");
    const { error } = await supabase.auth.signInWithOtp({ email: authEmail });
    if (error) setAuthMessage("Błąd logowania: " + error.message);
    else setAuthMessage("Sprawdź skrzynkę e-mail i kliknij link aktywacyjny!");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserReviews([]);
  };

  // Pobranie recenzji zalogowanego usera
  const fetchUserReviews = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("reviews")
      .select("id, ean, rating, comment, price, custom_name, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setUserReviews(data);
  };

  useEffect(() => {
    if (activeTab === "profile") fetchUserReviews();
  }, [activeTab]);

  const saveToRecent = (scannedEan, name) => {
    const updated = [{ ean: scannedEan, name }, ...recentScans.filter((i) => i.ean !== scannedEan)].slice(0, 5);
    setRecentScans(updated);
    localStorage.setItem("recent_scans", JSON.stringify(updated));
  };

  const fetchReviews = async (targetEan) => {
    setLoadingReviews(true);
    const { data } = await supabase
      .from("reviews")
      .select("id, rating, comment, price, is_recommended, custom_name, created_at, user_id")
      .eq("ean", targetEan)
      .order("created_at", { ascending: false });

    if (data) {
      setReviews(data);
      // Sprawdź, czy użytkownik już oceniał ten produkt (edycja)
      if (user) {
        const myPrev = data.find((r) => r.user_id === user.id);
        if (myPrev) {
          setRating(myPrev.rating);
          setComment(myPrev.comment || "");
          setPrice(myPrev.price ? String(myPrev.price) : "");
          setIsRecommended(myPrev.is_recommended);
        }
      }
    }
    setLoadingReviews(false);
  };

  const loadProductData = async (targetEan) => {
    if (navigator.vibrate) navigator.vibrate(100);
    setEan(targetEan);

    // 1. Sprawdź, czy w naszej bazie jest już zapisana własna nazwa
    const { data: nameData } = await supabase
      .from("product_names")
      .select("custom_name")
      .eq("ean", targetEan)
      .single();

    let fetchedName = nameData?.custom_name || null;
    let imgUrl = "";

    // 2. Jeśli nie ma w naszej bazie, spytaj Open Food Facts
    if (!fetchedName) {
      try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${targetEan}.json`);
        const data = await res.json();
        if (data.status === 1 && data.product.product_name) {
          fetchedName = data.product.product_name;
          imgUrl = data.product.image_url || "";
        }
      } catch (e) {}
    }

    const finalName = fetchedName || "Nieznany produkt";
    setProduct({ product_name: finalName, image_url: imgUrl });
    setCustomName(nameData?.custom_name || "");
    saveToRecent(targetEan, finalName);
    await fetchReviews(targetEan);
  };

  const saveReview = async () => {
    setIsSubmitting(true);
    const trimmedCustom = customName.trim();

    // 1. Zapis/Aktualizacja trwałej nazwy produktu, jeśli wpisano własną
    if (trimmedCustom) {
      await supabase
        .from("product_names")
        .upsert({ ean, custom_name: trimmedCustom }, { onConflict: "ean" });
      setProduct((prev) => ({ ...prev, product_name: trimmedCustom }));
    }

    // 2. Usunięcie starej recenzji użytkownika dla tego EAN (edycja)
    if (user) {
      await supabase.from("reviews").delete().eq("ean", ean).eq("user_id", user.id);
    }

    // 3. Dodanie nowej oceny
    const payload = {
      ean,
      rating,
      comment: comment.trim() || null,
      price: price ? parseFloat(price) : null,
      is_recommended: isRecommended,
      custom_name: trimmedCustom || null,
      user_id: user?.id || null,
    };

    const { error } = await supabase.from("reviews").insert([payload]);
    setIsSubmitting(false);

    if (error) {
      alert("Błąd zapisu!");
    } else {
      alert("Zapisano pomyślnie!");
      await fetchReviews(ean);
    }
  };

  const deleteReview = async (id) => {
    if (!confirm("Czy na pewno usunąć tę ocenę?")) return;
    await supabase.from("reviews").delete().eq("id", id);
    if (ean) fetchReviews(ean);
    if (activeTab === "profile") fetchUserReviews();
  };

  // Statystyki
  const averageRating = reviews.length
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  const recommendPercent = reviews.length
    ? Math.round((reviews.filter((r) => r.is_recommended).length / reviews.length) * 100)
    : null;

  const validPrices = reviews.filter((r) => r.price).map((r) => r.price);
  const avgPrice = validPrices.length
    ? (validPrices.reduce((a, b) => a + b, 0) / validPrices.length).toFixed(2)
    : null;

  const starCounts = [5, 4, 3, 2, 1].map((s) => ({
    star: s,
    count: reviews.filter((r) => r.rating === s).length,
  }));

  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortOrder === "highest") return b.rating - a.rating;
    if (sortOrder === "lowest") return a.rating - b.rating;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <main className={`min-h-screen p-4 flex flex-col items-center transition-colors ${darkMode ? "bg-gray-900 text-white" : "bg-gray-50 text-black"}`}>
      {/* Pasek górny: logowanie & motyw */}
      <header className="w-full max-w-md flex justify-between items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-800 text-xs">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-1 rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          {darkMode ? "☀️ Jasny" : "🌙 Ciemny"}
        </button>

        <div className="flex gap-2">
          {user ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab(activeTab === "scan" ? "profile" : "scan")}
                className="font-bold underline"
              >
                {activeTab === "scan" ? "👤 Moje oceny" : "🔍 Skaner"}
              </button>
              <button onClick={handleLogout} className="text-red-500">Wyloguj</button>
            </div>
          ) : (
            <span className="text-gray-400">Niezalogowany</span>
          )}
        </div>
      </header>

      {/* Formularz szybkiego logowania jeśli brak sesji */}
      {!user && activeTab === "scan" && !ean && (
        <form onSubmit={handleAuth} className="w-full max-w-md bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex flex-col gap-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">Zaloguj się e-mailem, aby trwale zapisywać swoje recenzje:</p>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="twoj@email.pl"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="border dark:border-gray-600 dark:bg-gray-700 p-1.5 rounded text-xs flex-1 outline-none"
            />
            <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-semibold">
              Wyślij link
            </button>
          </div>
          {authMessage && <p className="text-[11px] text-blue-500">{authMessage}</p>}
        </form>
      )}

      {/* WIDOK 1: MÓJ PROFIL */}
      {activeTab === "profile" && (
        <div className="w-full max-w-md bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
          <h2 className="text-lg font-bold mb-3">Twoje dodane recenzje ({userReviews.length})</h2>
          {userReviews.length === 0 ? (
            <p className="text-xs text-gray-400">Nie dodałeś jeszcze żadnych opinii jako zalogowany.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {userReviews.map((rev) => (
                <div key={rev.id} className="border-b dark:border-gray-700 pb-2 text-xs flex justify-between items-start">
                  <div>
                    <span className="font-bold">{rev.custom_name || `EAN: ${rev.ean}`}</span>
                    <p className="text-yellow-500">{"★".repeat(rev.rating)}</p>
                    {rev.comment && <p className="text-gray-600 dark:text-gray-300 mt-1">{rev.comment}</p>}
                    <p className="text-[10px] text-gray-400">{new Date(rev.created_at).toLocaleDateString("pl-PL")}</p>
                  </div>
                  <button onClick={() => deleteReview(rev.id)} className="text-red-500 text-xs hover:underline">
                    Usuń
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* WIDOK 2: SKANER I PRODUKT */}
      {activeTab === "scan" && (
        <>
          {!ean && (
            <div className="w-full max-w-md flex flex-col gap-4">
              <Scanner onScan={loadProductData} />

              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700 flex gap-2">
                <input
                  type="text"
                  placeholder="Wpisz kod EAN ręcznie..."
                  value={manualEan}
                  onChange={(e) => setManualEan(e.target.value)}
                  className="border dark:border-gray-600 dark:bg-gray-700 p-2 rounded flex-1 text-sm outline-none"
                />
                <button
                  onClick={() => manualEan && loadProductData(manualEan.trim())}
                  className="bg-blue-600 text-white px-4 rounded text-sm font-semibold"
                >
                  Szukaj
                </button>
              </div>

              {recentScans.length > 0 && (
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
                  <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Ostatnio sprawdzane</h4>
                  <div className="flex flex-col gap-1">
                    {recentScans.map((item) => (
                      <button
                        key={item.ean}
                        onClick={() => loadProductData(item.ean)}
                        className="text-left text-sm text-blue-600 dark:text-blue-400 hover:underline truncate"
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
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex flex-col items-center">
                {product.image_url && (
                  <img src={product.image_url} alt="Produkt" className="w-32 h-32 object-contain mb-3" />
                )}

                <h2 className="text-xl font-bold text-center mb-1">{product.product_name}</h2>
                <p className="text-gray-400 text-xs mb-3">EAN: {ean}</p>

                {/* Pole do ustawienia/poprawienia nazwy */}
                <div className="w-full mb-3">
                  <label className="text-[11px] text-gray-400 block mb-1">
                    {product.product_name === "Nieznany produkt" ? "Ten produkt nie ma nazwy. Wpisz ją:" : "Popraw nazwę (zapisze się dla każdego):"}
                  </label>
                  <input
                    type="text"
                    placeholder="Wpisz nazwę produktu..."
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full border dark:border-gray-600 dark:bg-gray-700 p-2 rounded text-sm bg-yellow-50 dark:bg-gray-700 border-yellow-300"
                  />
                </div>

                {/* Rozszerzone statystyki */}
                <div className="grid grid-cols-3 gap-2 w-full mb-3 text-center">
                  <div className="bg-blue-50 dark:bg-gray-700 border border-blue-100 dark:border-gray-600 rounded p-2">
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{averageRating || "-"}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 block">/ 5 ★ ({reviews.length})</span>
                  </div>
                  <div className="bg-green-50 dark:bg-gray-700 border border-green-100 dark:border-gray-600 rounded p-2">
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">{recommendPercent !== null ? `${recommendPercent}%` : "-"}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 block">poleca</span>
                  </div>
                  <div className="bg-purple-50 dark:bg-gray-700 border border-purple-100 dark:border-gray-600 rounded p-2">
                    <span className="text-lg font-bold text-purple-600 dark:text-purple-400">{avgPrice ? `${avgPrice} zł` : "-"}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 block">śr. cena</span>
                  </div>
                </div>

                {/* Wykres rozkładu gwiazdek */}
                {reviews.length > 0 && (
                  <div className="w-full mb-4 bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                    {starCounts.map((sc) => (
                      <div key={sc.star} className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                        <span className="w-4">{sc.star}★</span>
                        <div className="flex-1 bg-gray-200 dark:bg-gray-600 h-2 rounded overflow-hidden">
                          <div
                            className="bg-yellow-400 h-full"
                            style={{ width: `${(sc.count / reviews.length) * 100}%` }}
                          ></div>
                        </div>
                        <span className="w-3 text-right">{sc.count}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Formularz dodawania */}
                <div className="flex gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setRating(num)}
                      className={`w-9 h-9 text-xl rounded-full ${rating >= num ? "bg-yellow-400 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-400"}`}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 w-full mb-3">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Cena zakupu (zł)"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-1/2 border dark:border-gray-600 dark:bg-gray-700 p-2 rounded text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setIsRecommended(!isRecommended)}
                    className={`w-1/2 border rounded text-xs font-bold ${isRecommended ? "bg-green-100 dark:bg-green-900/40 border-green-400 text-green-700 dark:text-green-300" : "bg-red-100 dark:bg-red-900/40 border-red-400 text-red-700 dark:text-red-300"}`}
                  >
                    {isRecommended ? "👍 Polecam" : "👎 Odradzam"}
                  </button>
                </div>

                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Treść recenzji (opcjonalnie)..."
                  rows={2}
                  className="w-full border dark:border-gray-600 dark:bg-gray-700 p-2 rounded mb-3 text-sm outline-none"
                />

                <button
                  onClick={saveReview}
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 text-white font-bold py-2 rounded text-sm disabled:opacity-50"
                >
                  {isSubmitting ? "Zapisywanie..." : user ? "Zapisz / Zaktualizuj ocenę" : "Zapisz jako gość"}
                </button>

                <button
                  onClick={() => {
                    setEan(null);
                    setProduct(null);
                    setComment("");
                    setPrice("");
                    setCustomName("");
                  }}
                  className="mt-3 text-xs text-gray-500 dark:text-gray-400 underline"
                >
                  Skanuj kolejny produkt
                </button>
              </div>

              {/* Lista opinii z podziałem na własne i cudze */}
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-sm">Opinie ({reviews.length})</h3>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="text-xs border dark:border-gray-600 dark:bg-gray-700 p-1 rounded"
                  >
                    <option value="newest">Najnowsze</option>
                    <option value="highest">Najwyższa ocena</option>
                    <option value="lowest">Najniższa ocena</option>
                  </select>
                </div>

                {loadingReviews && <p className="text-xs text-gray-400">Pobieranie...</p>}

                <div className="flex flex-col gap-3">
                  {sortedReviews.map((rev) => (
                    <div key={rev.id} className="border-b dark:border-gray-700 pb-2 last:border-0 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-500 font-bold">{"★".repeat(rev.rating)}</span>
                          {user && rev.user_id === user.id && (
                            <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-1.5 py-0.5 rounded text-[9px] font-bold">
                              Twoja
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">{new Date(rev.created_at).toLocaleDateString("pl-PL")}</span>
                          {user && rev.user_id === user.id && (
                            <button onClick={() => deleteReview(rev.id)} className="text-red-500 text-[10px]">
                              Usuń
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                        <span>{rev.is_recommended ? "👍 Poleca" : "👎 Odradza"}</span>
                        {rev.price && <span>• Zakupiono za: {rev.price} zł</span>}
                      </div>
                      {rev.comment && <p className="text-gray-700 dark:text-gray-300">{rev.comment}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
