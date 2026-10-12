export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  clientIds: string[];
}

// a declaration merging; tells typescript that express request object can carry a user property
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
