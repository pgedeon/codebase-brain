// fixtures/ts-mini - Simple TypeScript project
export interface User {
  id: number;
  email: string;
}

export class UserRepository {
  private users: User[] = [];

  findById(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }

  findByEmail(email: string): User | undefined {
    return this.users.find(u => u.email === email);
  }

  save(user: User): void {
    this.users.push(user);
  }

  getAll(): User[] {
    return [...this.users];
  }
}

export function createUser(email: string, id?: number): User {
  return { id: id || Date.now(), email };
}

export function loginUser(email: string, password: string): User | null {
  // Simplified
  const repo = new UserRepository();
  const user = repo.findByEmail(email);
  if (user) {
    return user;
  }
  return null;
}

import { createUser, loginUser, UserRepository } from './users';
import { User } from './users';

export function authenticate(email: string, pwd: string): User | null {
  const user = loginUser(email, pwd);
  if (!user) return null;
  return user;
}

const repo = new UserRepository();
repo.save(createUser('test@example.com', 1));
