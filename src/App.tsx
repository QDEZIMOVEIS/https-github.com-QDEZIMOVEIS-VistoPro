/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, 
  collection, doc, setDoc, getDoc, query, where, onSnapshot, 
  addDoc, updateDoc, deleteDoc, serverTimestamp, FirebaseUser 
} from './firebase';
import { Property, Inspection, Room, Item, UserProfile, OperationType, Favorite } from './types';
import { handleFirestoreError } from './errorUtils';
import { 
  Plus, LogOut, Home, ClipboardList, ChevronRight, CheckCircle2, 
  Camera, Save, ArrowLeft, User, Settings, Heart, Scale, X, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Button = ({ 
  children, onClick, variant = 'primary', className, disabled, icon: Icon 
}: { 
  children: React.ReactNode, onClick?: () => void, variant?: 'primary' | 'secondary' | 'danger' | 'ghost', 
  className?: string, disabled?: boolean, icon?: any 
}) => {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
    secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100',
    ghost: 'bg-transparent text-gray-500 hover:bg-gray-100'
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        className
      )}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

const Card = ({ children, className, onClick, ...props }: { children: React.ReactNode, className?: string, onClick?: () => void } & React.HTMLAttributes<HTMLDivElement>) => (
  <div 
    {...props}
    onClick={onClick}
    className={cn(
      'bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all hover:shadow-md',
      onClick && 'cursor-pointer active:scale-[0.98]',
      className
    )}
  >
    {children}
  </div>
);

const Input = ({ label, value, onChange, placeholder, type = 'text', required }: { 
  label: string, value: string | number, onChange: (val: string) => void, placeholder?: string, type?: string, required?: boolean 
}) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-gray-700 ml-1">{label}</label>
    <input 
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
    />
  </div>
);

const Badge = ({ children, variant = 'neutral' }: { children: React.ReactNode, variant?: 'neutral' | 'success' | 'warning' | 'danger' }) => {
  const variants = {
    neutral: 'bg-gray-100 text-gray-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-red-50 text-red-600'
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', variants[variant])}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'property-form' | 'inspection-view' | 'comparison'>('dashboard');
  
  // Data State
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [comparisonList, setComparisonList] = useState<Property[]>([]);

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: u.uid,
            displayName: u.displayName,
            email: u.email,
            photoURL: u.photoURL,
            role: 'inspector'
          };
          await setDoc(doc(db, 'users', u.uid), newProfile);
          setUserProfile(newProfile);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Dashboard Data Effect
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'properties'), where('inspectorId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProperties(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Property)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'properties'));
    return unsubscribe;
  }, [user]);

  // Favorites Effect
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'favorites'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFavorites(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Favorite)));
    });
    return unsubscribe;
  }, [user]);

  // Inspection Data Effect
  useEffect(() => {
    if (!selectedProperty) return;
    const q = query(collection(db, 'inspections'), where('propertyId', '==', selectedProperty.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInspections(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Inspection)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'inspections'));
    return unsubscribe;
  }, [selectedProperty]);

  // Rooms & Items Data Effect
  useEffect(() => {
    if (!selectedInspection) return;
    const roomsQ = query(collection(db, 'rooms'), where('inspectionId', '==', selectedInspection.id));
    const unsubRooms = onSnapshot(roomsQ, (snapshot) => {
      setRooms(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Room)).sort((a, b) => a.order - b.order));
    });
    return unsubRooms;
  }, [selectedInspection]);

  useEffect(() => {
    if (rooms.length === 0) return;
    const itemsQ = query(collection(db, 'items'), where('roomId', 'in', rooms.map(r => r.id)));
    const unsubItems = onSnapshot(itemsQ, (snapshot) => {
      setItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Item)));
    });
    return unsubItems;
  }, [rooms]);

  // --- Handlers ---

  const handleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } catch (err) { console.error(err); }
  };

  const handleLogout = () => signOut(auth);

  const createProperty = async (p: Partial<Property>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'properties'), {
        ...p,
        inspectorId: user.uid,
        createdAt: serverTimestamp()
      });
      setView('dashboard');
    } catch (err) { handleFirestoreError(err, OperationType.CREATE, 'properties'); }
  };

  const createInspection = async (type: 'Entry' | 'Exit' | 'Periodic') => {
    if (!selectedProperty || !user) return;
    try {
      const docRef = await addDoc(collection(db, 'inspections'), {
        propertyId: selectedProperty.id,
        type,
        status: 'Draft',
        date: serverTimestamp(),
        inspectorId: user.uid
      });
      const defaultRooms = ['Sala', 'Cozinha', 'Banheiro', 'Quarto'];
      for (let i = 0; i < defaultRooms.length; i++) {
        const roomRef = await addDoc(collection(db, 'rooms'), { inspectionId: docRef.id, name: defaultRooms[i], order: i });
        const defaultItems = ['Paredes', 'Piso', 'Teto', 'Janelas', 'Porta'];
        for (const itemName of defaultItems) {
          await addDoc(collection(db, 'items'), { roomId: roomRef.id, name: itemName, status: 'Good', notes: '', photos: [] });
        }
      }
      setSelectedInspection({ id: docRef.id, propertyId: selectedProperty.id, type, status: 'Draft', date: new Date(), inspectorId: user.uid } as Inspection);
      setView('inspection-view');
    } catch (err) { handleFirestoreError(err, OperationType.CREATE, 'inspections'); }
  };

  const toggleFavorite = async (propertyId: string) => {
    if (!user) return;
    const existing = favorites.find(f => f.propertyId === propertyId);
    if (existing) {
      await deleteDoc(doc(db, 'favorites', existing.id));
    } else {
      await addDoc(collection(db, 'favorites'), { userId: user.uid, propertyId, createdAt: serverTimestamp() });
    }
  };

  const toggleComparison = (property: Property) => {
    if (comparisonList.find(p => p.id === property.id)) {
      setComparisonList(prev => prev.filter(p => p.id !== property.id));
    } else {
      if (comparisonList.length >= 4) return alert('Máximo de 4 imóveis para comparação.');
      setComparisonList(prev => [...prev, property]);
    }
  };

  const updateItemStatus = async (itemId: string, status: Item['status']) => {
    try { await updateDoc(doc(db, 'items', itemId), { status }); } catch (err) { handleFirestoreError(err, OperationType.UPDATE, 'items'); }
  };

  const updateItemNotes = async (itemId: string, notes: string) => {
    try { await updateDoc(doc(db, 'items', itemId), { notes }); } catch (err) { handleFirestoreError(err, OperationType.UPDATE, 'items'); }
  };

  const completeInspection = async () => {
    if (!selectedInspection) return;
    try {
      await updateDoc(doc(db, 'inspections', selectedInspection.id), { status: 'Completed' });
      setView('dashboard');
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, 'inspections'); }
  };

  // --- Views ---

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-500 font-medium animate-pulse">Carregando VistoPro...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-200 rotate-3">
            <ClipboardList className="text-white" size={40} />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">VistoPro</h1>
          <p className="text-gray-500 text-lg">Vistorias Imobiliárias Profissionais</p>
        </div>
        <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100 space-y-6">
          <p className="text-sm text-gray-600">Entre para começar a gerenciar suas vistorias com precisão e facilidade.</p>
          <Button onClick={handleLogin} className="w-full py-4 text-lg" icon={User}>Continuar com Google</Button>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FC] text-gray-900 font-sans">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <ClipboardList className="text-white" size={20} />
          </div>
          <span className="text-xl font-bold tracking-tight">VistoPro</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:block text-right">
            <p className="text-xs font-bold text-gray-900">{userProfile?.displayName}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">{userProfile?.role}</p>
          </div>
          <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 pb-24">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">Imóveis</h2>
                  <p className="text-gray-500">Gerencie seu portfólio de propriedades</p>
                </div>
                <div className="flex gap-2">
                  {comparisonList.length > 1 && (
                    <Button variant="secondary" onClick={() => setView('comparison')} icon={Scale}>Comparar ({comparisonList.length})</Button>
                  )}
                  <Button onClick={() => { setSelectedProperty(null); setView('property-form'); }} icon={Plus}>Novo Imóvel</Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {properties.map(p => {
                  const isFav = favorites.some(f => f.propertyId === p.id);
                  const isComparing = comparisonList.some(cp => cp.id === p.id);
                  return (
                    <Card key={p.id} onClick={() => setSelectedProperty(p)} className={cn(selectedProperty?.id === p.id && 'ring-2 ring-indigo-500')}>
                      <div className="p-5 space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600"><Home size={24} /></div>
                          <div className="flex gap-2">
                            <button onClick={(e) => { e.stopPropagation(); toggleComparison(p); }} className={cn("p-2 rounded-lg transition-colors", isComparing ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-400")}><Scale size={16} /></button>
                            <button onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }} className={cn("p-2 rounded-lg transition-colors", isFav ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-400")}><Heart size={16} fill={isFav ? "currentColor" : "none"} /></button>
                          </div>
                        </div>
                        <div>
                          <h3 className="font-bold text-lg line-clamp-1">{p.address}</h3>
                          <p className="text-sm text-gray-500 flex items-center gap-1"><User size={12} /> {p.tenantName || 'Sem inquilino'}</p>
                          <div className="flex gap-3 mt-2 text-xs text-gray-400">
                            <span>{p.bedrooms || 0} Qts</span>
                            <span>{p.size || 0} m²</span>
                            <span className="font-bold text-indigo-600">R$ {p.price?.toLocaleString() || 0}</span>
                          </div>
                        </div>
                        <div className="pt-4 border-t border-gray-50 flex items-center justify-between text-xs text-gray-400">
                          <span>Criado em {new Date(p.createdAt?.toDate?.() || Date.now()).toLocaleDateString()}</span>
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {selectedProperty && (
                <div className="space-y-6 pt-8 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold">Vistorias para {selectedProperty.address}</h3>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => createInspection('Entry')} icon={Plus}>Entrada</Button>
                      <Button variant="secondary" onClick={() => createInspection('Exit')} icon={Plus}>Saída</Button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {inspections.map(ins => (
                      <Card key={ins.id} onClick={() => { setSelectedInspection(ins); setView('inspection-view'); }} className="p-4 flex items-center justify-between hover:bg-gray-50">
                        <div className="flex items-center gap-4">
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", ins.type === 'Entry' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}><ClipboardList size={20} /></div>
                          <div>
                            <p className="font-bold">Vistoria de {ins.type === 'Entry' ? 'Entrada' : 'Saída'}</p>
                            <p className="text-xs text-gray-500">{new Date(ins.date?.toDate?.() || Date.now()).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant={ins.status === 'Completed' ? 'success' : 'warning'}>{ins.status === 'Completed' ? 'Concluída' : 'Rascunho'}</Badge>
                          <ChevronRight size={18} className="text-gray-300" />
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'property-form' && (
            <motion.div key="property-form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-2xl mx-auto space-y-8">
              <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => setView('dashboard')} icon={ArrowLeft}>Voltar</Button>
                <h2 className="text-3xl font-bold">Novo Imóvel</h2>
              </div>
              <Card className="p-8 space-y-6">
                <Input label="Endereço do Imóvel" placeholder="Rua Exemplo, 123" value={selectedProperty?.address || ''} onChange={(v) => setSelectedProperty(prev => ({ ...prev, address: v } as Property))} required />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input label="Nome do Proprietário" placeholder="João Silva" value={selectedProperty?.ownerName || ''} onChange={(v) => setSelectedProperty(prev => ({ ...prev, ownerName: v } as Property))} />
                  <Input label="Nome do Inquilino" placeholder="Maria Souza" value={selectedProperty?.tenantName || ''} onChange={(v) => setSelectedProperty(prev => ({ ...prev, tenantName: v } as Property))} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Input label="Preço (R$)" type="number" value={selectedProperty?.price || ''} onChange={(v) => setSelectedProperty(prev => ({ ...prev, price: Number(v) } as Property))} />
                  <Input label="Tamanho (m²)" type="number" value={selectedProperty?.size || ''} onChange={(v) => setSelectedProperty(prev => ({ ...prev, size: Number(v) } as Property))} />
                  <Input label="Quartos" type="number" value={selectedProperty?.bedrooms || ''} onChange={(v) => setSelectedProperty(prev => ({ ...prev, bedrooms: Number(v) } as Property))} />
                  <Input label="Banheiros" type="number" value={selectedProperty?.bathrooms || ''} onChange={(v) => setSelectedProperty(prev => ({ ...prev, bathrooms: Number(v) } as Property))} />
                </div>
                <Button className="w-full py-4 text-lg" onClick={() => createProperty(selectedProperty || {})} disabled={!selectedProperty?.address}>Salvar Imóvel</Button>
              </Card>
            </motion.div>
          )}

          {view === 'comparison' && (
            <motion.div key="comparison" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
              <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => setView('dashboard')} icon={ArrowLeft}>Voltar</Button>
                <h2 className="text-3xl font-bold">Comparação de Imóveis</h2>
              </div>
              <div className="overflow-x-auto pb-4">
                <div className="flex gap-6 min-w-max">
                  {comparisonList.map(p => (
                    <Card key={p.id} className="w-72 p-6 space-y-6 relative">
                      <button onClick={() => toggleComparison(p)} className="absolute top-4 right-4 p-1 rounded-full bg-gray-100 text-gray-500 hover:text-red-500"><X size={16} /></button>
                      <div className="w-full h-40 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-200"><Home size={64} /></div>
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Endereço</p>
                          <p className="font-bold line-clamp-2">{p.address}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div><p className="text-[10px] font-bold text-gray-400 uppercase">Preço</p><p className="font-bold text-indigo-600">R$ {p.price?.toLocaleString()}</p></div>
                          <div><p className="text-[10px] font-bold text-gray-400 uppercase">Tamanho</p><p className="font-bold">{p.size} m²</p></div>
                          <div><p className="text-[10px] font-bold text-gray-400 uppercase">Quartos</p><p className="font-bold">{p.bedrooms}</p></div>
                          <div><p className="text-[10px] font-bold text-gray-400 uppercase">Banheiros</p><p className="font-bold">{p.bathrooms}</p></div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'inspection-view' && selectedInspection && (
            <motion.div key="inspection-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" onClick={() => setView('dashboard')} icon={ArrowLeft}>Voltar</Button>
                  <div>
                    <h2 className="text-2xl font-bold">Vistoria de {selectedInspection.type === 'Entry' ? 'Entrada' : 'Saída'}</h2>
                    <p className="text-sm text-gray-500">{selectedProperty?.address}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setView('dashboard')} icon={Save}>Salvar Rascunho</Button>
                  <Button onClick={completeInspection} icon={CheckCircle2}>Concluir</Button>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-1 space-y-4">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-2">Cômodos</h3>
                  <div className="space-y-1">
                    {rooms.map(room => (
                      <button key={room.id} className="w-full text-left px-4 py-3 rounded-xl transition-all font-medium flex items-center justify-between hover:bg-indigo-50 hover:text-indigo-600">
                        {room.name} <ChevronRight size={14} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lg:col-span-3 space-y-8">
                  {rooms.map(room => (
                    <div key={room.id} className="space-y-4">
                      <div className="flex items-center gap-2 px-2"><div className="w-2 h-6 bg-indigo-600 rounded-full"></div><h3 className="text-xl font-bold">{room.name}</h3></div>
                      <div className="space-y-4">
                        {items.filter(i => i.roomId === room.id).map(item => (
                          <Card key={item.id} className="p-6 space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-lg">{item.name}</h4>
                              <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                                {(['Good', 'Regular', 'Bad', 'N/A'] as Item['status'][]).map(s => (
                                  <button key={s} onClick={() => updateItemStatus(item.id, s)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", item.status === s ? "bg-white shadow-sm text-indigo-600" : "text-gray-400 hover:text-gray-600")}>{s}</button>
                                ))}
                              </div>
                            </div>
                            <textarea placeholder="Notas sobre o estado..." value={item.notes} onChange={(e) => updateItemNotes(item.id, e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10" rows={2} />
                            <button className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg hover:bg-indigo-100 transition-colors"><Camera size={14} /> Adicionar Fotos</button>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
