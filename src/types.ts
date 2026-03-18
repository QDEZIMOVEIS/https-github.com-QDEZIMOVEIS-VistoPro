export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role: 'inspector' | 'admin';
}

export interface Property {
  id: string;
  address: string;
  ownerName: string;
  tenantName: string;
  inspectorId: string;
  price: number;
  size: number;
  bedrooms: number;
  bathrooms: number;
  createdAt: any;
}

export interface Favorite {
  id: string;
  userId: string;
  propertyId: string;
  createdAt: any;
}

export interface Inspection {
  id: string;
  propertyId: string;
  type: 'Entry' | 'Exit' | 'Periodic';
  status: 'Draft' | 'Completed';
  date: any;
  inspectorId: string;
}

export interface Room {
  id: string;
  inspectionId: string;
  name: string;
  order: number;
}

export interface Item {
  id: string;
  roomId: string;
  name: string;
  status: 'Good' | 'Regular' | 'Bad' | 'N/A';
  notes: string;
  photos: string[];
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
