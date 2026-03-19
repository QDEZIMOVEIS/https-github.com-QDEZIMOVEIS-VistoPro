/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  auth, db, storage, googleProvider, signInWithPopup, signOut, onAuthStateChanged, 
  collection, doc, setDoc, getDoc, query, where, onSnapshot, 
  addDoc, updateDoc, deleteDoc, serverTimestamp, FirebaseUser,
  ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject, UploadTask
} from './firebase';
import { Property, Inspection, Room, Item, UserProfile, OperationType, Favorite, Media } from './types';
import { handleFirestoreError } from './errorUtils';
import { 
  Plus, LogOut, Home, ClipboardList, ChevronRight, CheckCircle2, 
  Camera, Save, ArrowLeft, User, Settings, Heart, Scale, X, Info,
  MessageSquare, Sparkles, Mic, Play, Loader2, Image as ImageIcon,
  Video as VideoIcon, Wand2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as aiService from './geminiService';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

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
  const [activeUploads, setActiveUploads] = useState<Record<string, { progress: number, task: UploadTask, roomId: string }>>({});

  // AI State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Check API Key
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkKey();
  }, []);

  const handleOpenSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

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
    if (!user || !user.uid) return;
    const q = query(collection(db, 'favorites'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFavorites(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Favorite)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'favorites'));
    return unsubscribe;
  }, [user]);

  // Inspection Data Effect
  useEffect(() => {
    if (!selectedProperty || !selectedProperty.id || !user) return;
    const q = query(
      collection(db, 'inspections'), 
      where('propertyId', '==', selectedProperty.id),
      where('inspectorId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInspections(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Inspection)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'inspections'));
    return unsubscribe;
  }, [selectedProperty, user]);

  // Rooms & Items Data Effect
  useEffect(() => {
    if (!selectedInspection || !selectedInspection.id) return;
    const roomsQ = query(collection(db, 'rooms'), where('inspectionId', '==', selectedInspection.id));
    const unsubRooms = onSnapshot(roomsQ, (snapshot) => {
      setRooms(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Room)).sort((a, b) => a.order - b.order));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'rooms'));
    return unsubRooms;
  }, [selectedInspection]);

  useEffect(() => {
    if (rooms.length === 0) return;
    const roomIds = rooms.map(r => r.id).filter(id => !!id);
    if (roomIds.length === 0) return;
    
    const itemsQ = query(collection(db, 'items'), where('roomId', 'in', roomIds));
    const unsubItems = onSnapshot(itemsQ, (snapshot) => {
      setItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Item)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'items'));
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

  const deleteProperty = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este imóvel e todas as suas vistorias?')) return;
    try {
      await deleteDoc(doc(db, 'properties', id));
      if (selectedProperty?.id === id) {
        setSelectedProperty(null);
      }
    } catch (err) { handleFirestoreError(err, OperationType.DELETE, 'properties'); }
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
        await addDoc(collection(db, 'rooms'), { 
          inspectionId: docRef.id, 
          name: defaultRooms[i], 
          order: i,
          notes: '',
          media: []
        });
      }
      setSelectedInspection({ id: docRef.id, propertyId: selectedProperty.id, type, status: 'Draft', date: new Date(), inspectorId: user.uid } as Inspection);
      setView('inspection-view');
    } catch (err) { handleFirestoreError(err, OperationType.CREATE, 'inspections'); }
  };

  const deleteInspection = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta vistoria?')) return;
    try {
      await deleteDoc(doc(db, 'inspections', id));
      // In a real app, we'd also delete rooms and items, but for now we'll just delete the inspection
    } catch (err) { handleFirestoreError(err, OperationType.DELETE, 'inspections'); }
  };

  const addRoom = async () => {
    if (!selectedInspection) return;
    const name = window.prompt('Nome do Cômodo:');
    if (!name) return;
    try {
      await addDoc(collection(db, 'rooms'), {
        inspectionId: selectedInspection.id,
        name,
        order: rooms.length,
        notes: '',
        media: []
      });
    } catch (err) { handleFirestoreError(err, OperationType.CREATE, 'rooms'); }
  };

  const deleteRoom = async (roomId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este cômodo?')) return;
    try {
      await deleteDoc(doc(db, 'rooms', roomId));
    } catch (err) { handleFirestoreError(err, OperationType.DELETE, 'rooms'); }
  };

  const updateRoomNotes = async (roomId: string, notes: string) => {
    try {
      await updateDoc(doc(db, 'rooms', roomId), { notes });
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, 'rooms'); }
  };

  const handleFileUpload = async (roomId: string, file: File, type: 'photo' | 'video') => {
    if (!user || !selectedInspection) return;
    const fileId = Math.random().toString(36).substring(7);
    const uploadId = `${roomId}_${fileId}`;
    
    try {
      const storageRef = ref(storage, `inspections/${selectedInspection.id}/rooms/${roomId}/${fileId}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      setActiveUploads(prev => ({
        ...prev,
        [uploadId]: { progress: 0, task: uploadTask, roomId }
      }));

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setActiveUploads(prev => ({
            ...prev,
            [uploadId]: { ...prev[uploadId], progress }
          }));
        }, 
        (error) => {
          console.error('Upload failed:', error);
          setActiveUploads(prev => {
            const next = { ...prev };
            delete next[uploadId];
            return next;
          });
          if (error.code !== 'storage/canceled') {
            alert('Erro ao fazer upload do arquivo.');
          }
        }, 
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          const room = rooms.find(r => r.id === roomId);
          if (room) {
            const newMedia: Media = {
              id: fileId,
              type,
              url,
              createdAt: new Date()
            };
            const updatedMedia = [...(room.media || []), newMedia];
            await updateDoc(doc(db, 'rooms', roomId), { media: updatedMedia });
          }
          setActiveUploads(prev => {
            const next = { ...prev };
            delete next[uploadId];
            return next;
          });
        }
      );
    } catch (err) {
      console.error('Error initiating upload:', err);
      alert('Erro ao iniciar upload.');
    }
  };

  const cancelUpload = (uploadId: string) => {
    const upload = activeUploads[uploadId];
    if (upload) {
      upload.task.cancel();
      setActiveUploads(prev => {
        const next = { ...prev };
        delete next[uploadId];
        return next;
      });
    }
  };

  const deleteMedia = async (roomId: string, mediaId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este arquivo?')) return;
    try {
      const room = rooms.find(r => r.id === roomId);
      if (!room) return;
      
      const mediaToDelete = room.media.find(m => m.id === mediaId);
      if (mediaToDelete) {
        // Try to delete from storage if it's a storage URL
        try {
          const storageRef = ref(storage, mediaToDelete.url);
          await deleteObject(storageRef);
        } catch (e) {
          console.warn('Could not delete from storage, might be a mock URL:', e);
        }
      }
      
      const updatedMedia = room.media.filter(m => m.id !== mediaId);
      await updateDoc(doc(db, 'rooms', roomId), { media: updatedMedia });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'rooms');
    }
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

  // AI Handlers
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const response = await aiService.chatWithGemini(userMsg);
      setChatMessages(prev => [...prev, { role: 'ai', text: response || 'Desculpe, não consegui processar sua solicitação.' }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Erro ao conectar com a IA.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleGeneratePropertyImage = async (address: string) => {
    if (!hasApiKey) {
      await handleOpenSelectKey();
    }
    setIsGeneratingImage(true);
    try {
      const prompt = `Uma foto profissional de alta qualidade de um imóvel localizado em: ${address}. Estilo arquitetônico moderno, iluminação natural, bem decorado.`;
      const imageUrl = await aiService.generateImage(prompt);
      if (imageUrl && selectedProperty) {
        // In a real app, we'd upload this to storage, but for now we'll just show it
        alert('Imagem gerada com sucesso! (Em um app real, ela seria salva no banco de dados)');
        // Update property with generated image (mocking for now)
        // await updateDoc(doc(db, 'properties', selectedProperty.id), { imageUrl });
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar imagem.');
    } finally {
      setIsGeneratingImage(false);
    }
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
                            <button onClick={(e) => { e.stopPropagation(); deleteProperty(p.id); }} className="p-2 rounded-lg bg-gray-100 text-gray-400 hover:text-red-500 transition-colors"><X size={16} /></button>
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
                      <Card key={ins.id} onClick={() => { setSelectedInspection(ins); setView('inspection-view'); }} className="p-4 flex items-center justify-between hover:bg-gray-50 group">
                        <div className="flex items-center gap-4">
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", ins.type === 'Entry' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}><ClipboardList size={20} /></div>
                          <div>
                            <p className="font-bold">Vistoria de {ins.type === 'Entry' ? 'Entrada' : 'Saída'}</p>
                            <p className="text-xs text-gray-500">{new Date(ins.date?.toDate?.() || Date.now()).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant={ins.status === 'Completed' ? 'success' : 'warning'}>{ins.status === 'Completed' ? 'Concluída' : 'Rascunho'}</Badge>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteInspection(ins.id); }}
                            className="p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X size={18} />
                          </button>
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
                <div className="pt-4 flex gap-4">
                  <Button className="flex-1 py-4 text-lg" onClick={() => createProperty(selectedProperty || {})} disabled={!selectedProperty?.address}>Salvar Imóvel</Button>
                  <Button variant="secondary" className="px-6" onClick={() => handleGeneratePropertyImage(selectedProperty?.address || '')} disabled={!selectedProperty?.address || isGeneratingImage} icon={isGeneratingImage ? Loader2 : Sparkles}>
                    {isGeneratingImage ? 'Gerando...' : 'IA: Gerar Foto'}
                  </Button>
                </div>
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
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Cômodos</h3>
                    <button onClick={addRoom} className="p-1 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Plus size={18} /></button>
                  </div>
                  <div className="space-y-1">
                    {rooms.map(room => (
                      <button key={room.id} className="w-full text-left px-4 py-3 rounded-xl transition-all font-medium flex items-center justify-between hover:bg-indigo-50 hover:text-indigo-600 group">
                        {room.name} 
                        <div className="flex items-center gap-2">
                          <X size={14} onClick={(e) => { e.stopPropagation(); deleteRoom(room.id); }} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all" />
                          <ChevronRight size={14} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lg:col-span-3 space-y-8">
                  {rooms.map(room => (
                    <div key={room.id} className="space-y-4">
                      <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-6 bg-indigo-600 rounded-full"></div>
                          <h3 className="text-xl font-bold">{room.name}</h3>
                        </div>
                        <button onClick={() => deleteRoom(room.id)} className="text-xs text-red-500 font-bold hover:underline">Remover Cômodo</button>
                      </div>
                      <Card className="p-6 space-y-6">
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-gray-700">Observações e Vistoria</label>
                          <textarea 
                            placeholder="Descreva o estado do cômodo, detalhes importantes, etc..." 
                            value={room.notes || ''} 
                            onChange={(e) => updateRoomNotes(room.id, e.target.value)} 
                            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 min-h-[120px]" 
                          />
                        </div>
                        
                        <div className="flex flex-wrap gap-3">
                          <label className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-4 py-2.5 rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer">
                            <Camera size={16} /> Adicionar Foto
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(room.id, file, 'photo');
                              }} 
                            />
                          </label>
                          <label className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-4 py-2.5 rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer">
                            <VideoIcon size={16} /> Adicionar Vídeo
                            <input 
                              type="file" 
                              accept="video/*" 
                              className="hidden" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(room.id, file, 'video');
                              }} 
                            />
                          </label>
                          <button 
                            onClick={async () => {
                              const mockAudioBase64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
                              const transcription = await aiService.transcribeAudio(mockAudioBase64);
                              updateRoomNotes(room.id, (room.notes ? room.notes + ' ' : '') + transcription);
                            }}
                            className="flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-4 py-2.5 rounded-xl hover:bg-emerald-100 transition-colors"
                          >
                            <Mic size={16} /> IA: Transcrever Áudio
                          </button>
                          <button 
                            onClick={async () => {
                              if (!room.notes) return;
                              const audioData = await aiService.textToSpeech(room.notes);
                              if (audioData) {
                                const audio = new Audio(`data:audio/wav;base64,${audioData}`);
                                audio.play();
                              }
                            }}
                            className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 px-4 py-2.5 rounded-xl hover:bg-amber-100 transition-colors"
                          >
                            <Play size={16} /> IA: Ouvir Notas
                          </button>
                        </div>

                        {/* Media Preview */}
                        {( (room.media && room.media.length > 0) || Object.values(activeUploads).some((u: any) => u.roomId === room.id) ) && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-50">
                            {/* Active Uploads */}
                            {Object.entries(activeUploads)
                              .filter(([_, u]: [string, any]) => u.roomId === room.id)
                              .map(([id, u]: [string, any]) => (
                                <div key={id} className="relative aspect-square bg-indigo-50 rounded-2xl overflow-hidden border border-indigo-100 flex flex-col items-center justify-center p-4">
                                  <Loader2 className="text-indigo-600 animate-spin mb-2" size={24} />
                                  <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                                    <div 
                                      className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300" 
                                      style={{ width: `${u.progress}%` }}
                                    ></div>
                                  </div>
                                  <p className="text-[10px] font-bold text-indigo-600 mb-2">{Math.round(u.progress)}%</p>
                                  <button 
                                    onClick={() => cancelUpload(id)}
                                    className="text-[10px] text-red-500 font-bold hover:underline"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ))}

                            {/* Existing Media */}
                            {room.media?.map((m) => (
                              <div key={m.id} className="relative aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 group/media">
                                {m.type === 'photo' ? (
                                  <img 
                                    src={m.url} 
                                    alt="Vistoria" 
                                    className="w-full h-full object-cover" 
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gray-900">
                                    <video src={m.url} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <Play className="text-white opacity-50" size={32} />
                                    </div>
                                  </div>
                                )}
                                <button 
                                  onClick={() => deleteMedia(room.id, m.id)}
                                  className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover/media:opacity-100 transition-all hover:bg-red-600"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    </div>
                  ))}
                  
                  <div className="pt-4">
                    <Button variant="secondary" className="w-full py-4 border-dashed border-2" onClick={addRoom} icon={Plus}>
                      Adicionar Novo Cômodo
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* AI Chat Button */}
      <button 
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50"
      >
        <MessageSquare size={24} />
      </button>

      {/* AI Chat Modal */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-24 right-6 w-full max-w-sm h-[500px] bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col z-50"
          >
            <div className="p-4 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={18} />
                <span className="font-bold">VistoPro AI</span>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {chatMessages.length === 0 && (
                <div className="text-center py-10 space-y-2">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Info size={24} />
                  </div>
                  <p className="text-sm font-bold text-gray-900">Como posso ajudar?</p>
                  <p className="text-xs text-gray-500 px-8">Pergunte sobre vistorias, normas técnicas ou como usar o VistoPro.</p>
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] p-3 rounded-2xl text-sm",
                    msg.role === 'user' ? "bg-indigo-600 text-white rounded-tr-none" : "bg-gray-100 text-gray-800 rounded-tl-none"
                  )}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 p-3 rounded-2xl rounded-tl-none flex gap-1">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-2">
              <input 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Digite sua mensagem..."
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button 
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || isChatLoading}
                className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
