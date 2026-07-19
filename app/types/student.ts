export type Student = {
  id: string;

  nombre: string;
  apellidos: string;

  avatar: string;

  email?: string;

  claseId: string;

  numeroLista: number;

  cristales: number;

  activo: boolean;

  notas: string;

  fechaCreacion: Date;
};