import React, { useEffect, useState, useRef } from 'react';
import ThemeToggle from './ThemeToggle';
import { db } from './firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';

const TABLE_COUNT = 10;

const PRODUCTS = [
  { id: 'd1', name: 'Adana Döner', category: 'Dönerler', price: 95 },
  { id: 'd2', name: 'Tavuk Döner', category: 'Dönerler', price: 85 },
  { id: 'i1', name: 'Kola', category: 'İçecekler', price: 20 },
  { id: 'i2', name: 'Ayran', category: 'İçecekler', price: 12 },
  { id: 'a1', name: 'Patates Kızartması', category: 'Atıştırmalıklar', price: 40 },
  { id: 'a2', name: 'Soslu Cips', category: 'Atıştırmalıklar', price: 25 }
];

export default function App() {
  const [activeOrders, setActiveOrders] = useState({});
  const [selectedTable, setSelectedTable] = useState('Masa 1');
  const [viewReports, setViewReports] = useState(false);
  const [sales, setSales] = useState([]);
  const receiptRef = useRef(null);

  useEffect(() => {
    const col = collection(db, 'active_orders');
    const unsub = onSnapshot(col, (snap) => {
      const map = {};
      snap.docs.forEach(d => {
        map[d.id] = d.data();
      });
      setActiveOrders(map);
    }, (err)=>{
      console.warn('Firestore onSnapshot error', err);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (viewReports) fetchSalesHistory();
  }, [viewReports]);

  async function fetchSalesHistory() {
    try {
      const snap = await getDocs(collection(db, 'sales_history'));
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSales(arr.sort((a,b)=> (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)));
    } catch(e) {
      console.warn('fetchSalesHistory failed', e);
    }
  }

  function tableId(idx) { return `Masa ${idx}`; }

  function getOrderFor(table) { return activeOrders[table] || null; }

  function orderTotal(order) {
    if (!order || !order.items) return 0;
    return order.items.reduce((s,i)=> s + (i.price * i.qty), 0);
  }

  async function addProductToSelected(product) {
    const table = selectedTable;
    const docRef = doc(db, 'active_orders', table);
    const current = getOrderFor(table);
    if (!current) {
      const newOrder = {
        table,
        items: [{ ...product, qty: 1 }],
        updatedAt: serverTimestamp()
      };
      await setDoc(docRef, newOrder);
      return;
    }
    const items = [...(current.items||[])];
    const found = items.find(i=>i.id===product.id);
    if (found) found.qty += 1; else items.push({ ...product, qty: 1 });
    await updateDoc(docRef, { items, updatedAt: serverTimestamp() }).catch(async ()=>{
      await setDoc(docRef, { table, items, updatedAt: serverTimestamp() });
    });
  }

  async function changeQty(table, productId, delta) {
    const docRef = doc(db, 'active_orders', table);
    const order = getOrderFor(table);
    if (!order) return;
    const items = (order.items||[]).map(i=> ({...i}));
    const idx = items.findIndex(i=>i.id===productId);
    if (idx === -1) return;
    items[idx].qty += delta;
    if (items[idx].qty <= 0) items.splice(idx,1);
    if (items.length === 0) {
      await deleteDoc(docRef);
      return;
    }
    await updateDoc(docRef, { items, updatedAt: serverTimestamp() });
  }

  async function closeBill(table, method) {
    const order = getOrderFor(table);
    if (!order) return;
    const total = orderTotal(order);
    const record = {
      table,
      items: order.items,
      total,
      paymentMethod: method,
      createdAt: serverTimestamp(),
      day: new Date().getDate(),
      month: new Date().getMonth()+1,
      year: new Date().getFullYear()
    };
    await addDoc(collection(db, 'sales_history'), record);
    await deleteDoc(doc(db, 'active_orders', table));
    // Trigger print
    setTimeout(()=>{
      if (receiptRef.current) {
        try { window.print(); } catch(e) { console.warn('Print failed', e); }
      }
    }, 300);
  }

  // Reports aggregation
  const today = new Date();
  const dailyTotal = sales.filter(s => s.day === today.getDate() && s.month === (today.getMonth()+1) && s.year === today.getFullYear()).reduce((a,b)=>a + (b.total||0), 0);
  const monthlyTotal = sales.filter(s => s.month === (today.getMonth()+1) && s.year === today.getFullYear()).reduce((a,b)=>a + (b.total||0), 0);
  const yearlyTotal = sales.filter(s => s.year === today.getFullYear()).reduce((a,b)=>a + (b.total||0), 0);

  const categories = [...new Set(PRODUCTS.map(p=>p.category))];

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between p-4 panel">
        <div className="text-xl font-semibold">Lezzet Büfe - Yazarkasa</div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button onClick={()=>setViewReports(false)} className="px-3 py-1 rounded bg-gray-200 text-gray-900">Ana Panel</button>
          <button onClick={()=>setViewReports(true)} className="px-3 py-1 rounded bg-red-600 text-white">📊 Raporlar</button>
        </div>
      </header>

      <main className="flex-1 flex bg-white text-gray-900 gap-4 p-4">
        {!viewReports && (
          <>
            {/* Left - Tables */}
            <aside className="w-1/4 column-scroll panel p-4">
              <h2 className="mb-4 text-lg">Masalar</h2>
              <div className="grid grid-cols-2 gap-4">
                {Array.from({length: TABLE_COUNT}).map((_,i)=>{
                  const t = tableId(i+1);
                  const order = getOrderFor(t);
                  const occupied = !!order;
                  return (
                    <div key={t} className="flex flex-col items-stretch">
                      <button onClick={()=>setSelectedTable(t)} className={`h-28 rounded-lg text-lg font-semibold ${selectedTable===t? 'ring-2 ring-red-500':''} ${occupied? 'bg-red-600':'bg-green-700'} flex items-center justify-center`}>{t}</button>
                      <div className="text-sm mt-1 text-gray-600">{occupied ? `Tutar: ₺${orderTotal(order)}` : 'Boş'}</div>
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* Middle - Menu */}
            <section className="w-1/3 column-scroll panel p-4">
              <h2 className="mb-4 text-lg">Menü - Seçili: {selectedTable}</h2>
              <div className="space-y-4">
                {categories.map(cat=> (
                  <div key={cat}>
                    <h3 className="font-semibold mb-2">{cat}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {PRODUCTS.filter(p=>p.category===cat).map(p=> (
                        <button key={p.id} onClick={()=>addProductToSelected(p)} className="p-3 rounded bg-white hover:bg-gray-50 text-left border">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-sm text-gray-400">₺{p.price}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Right - Active Order */}
            <aside className="flex-1 column-scroll panel p-4">
              <h2 className="mb-4 text-lg">Aktif Adisyon - {selectedTable}</h2>
              <div className="p-4">
                {(() => {
                  const order = getOrderFor(selectedTable);
                  if (!order) return <div className="text-gray-400">Bu masada adisyon yok.</div>;
                  return (
                    <>
                      <div className="space-y-2">
                        {order.items.map(it=> (
                          <div key={it.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                            <div>
                              <div className="font-medium">{it.name}</div>
                              <div className="text-sm text-gray-400">₺{it.price} x {it.qty}</div>
                            </div>
                              <div className="flex items-center gap-2">
                              <button onClick={()=>changeQty(selectedTable, it.id, -1)} className="px-2 py-1 bg-gray-200 text-gray-900 rounded">-</button>
                              <button onClick={()=>changeQty(selectedTable, it.id, 1)} className="px-2 py-1 bg-gray-200 text-gray-900 rounded">+</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-xl font-semibold">Toplam: ₺{orderTotal(order)}</div>
                        <div className="flex gap-2">
                          <button onClick={()=>closeBill(selectedTable, 'cash')} className="px-4 py-2 bg-yellow-500 text-black rounded">💵 Nakit / Kapat</button>
                          <button onClick={()=>closeBill(selectedTable, 'card')} className="px-4 py-2 bg-green-600 rounded">💳 Kart / Kapat</button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </aside>
          </>
        )}

        {/* Reports view */}
        {viewReports && (
          <section className="p-6 w-full">
            <h2 className="text-2xl mb-4">📊 Raporlar</h2>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-white rounded border">
                <div className="text-sm text-gray-500">Günlük Ciro</div>
                <div className="text-2xl font-bold mt-2">₺{dailyTotal}</div>
              </div>
              <div className="p-4 bg-white rounded border">
                <div className="text-sm text-gray-500">Aylık Ciro</div>
                <div className="text-2xl font-bold mt-2">₺{monthlyTotal}</div>
              </div>
              <div className="p-4 bg-white rounded border">
                <div className="text-sm text-gray-500">Yıllık Ciro</div>
                <div className="text-2xl font-bold mt-2">₺{yearlyTotal}</div>
              </div>
            </div>

            <div className="bg-white rounded p-4 border">
              <h3 className="mb-2 font-semibold">Geçmiş Satışlar</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="px-3 py-2">Tarih</th>
                      <th className="px-3 py-2">Masa</th>
                      <th className="px-3 py-2">Ödeme</th>
                      <th className="px-3 py-2">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map(s=> (
                      <tr key={s.id} className="border-t border-gray-700">
                        <td className="px-3 py-2">{s.day}/{s.month}/{s.year}</td>
                        <td className="px-3 py-2">{s.table}</td>
                        <td className="px-3 py-2">{s.paymentMethod}</td>
                        <td className="px-3 py-2">₺{s.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Hidden receipt element for printing */}
      <div ref={receiptRef} className="receipt-print receipt-80mm">
        <div className="p-4 bg-white text-black">
          <div className="text-center font-bold text-lg">Lezzet Büfe</div>
          <div className="text-center text-sm">Adresiniz · Telefon</div>
          <div className="mt-3 border-t border-gray-300 pt-2">
            <div className="text-sm">-- FİŞ --</div>
            <div className="mt-2">
              {(() => {
                const ord = getOrderFor(selectedTable);
                if (!ord) return <div>Satış kaydı bulunmuyor.</div>;
                return (
                  <div>
                    <div className="text-sm">Masa: {selectedTable}</div>
                    {ord.items.map(it=> (
                      <div key={it.id} className="flex justify-between text-sm">
                        <div>{it.name} x{it.qty}</div>
                        <div>₺{it.price * it.qty}</div>
                      </div>
                    ))}
                    <div className="mt-2 font-semibold">Toplam: ₺{orderTotal(ord)}</div>
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="mt-4 text-center text-sm">Teşekkürler, tekrar bekleriz!</div>
        </div>
      </div>
    </div>
  );
}
