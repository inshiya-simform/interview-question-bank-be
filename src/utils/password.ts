import bcrypt from 'bcryptjs';

const COST = 10;

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, COST);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);
