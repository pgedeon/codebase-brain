// fixtures/ts-mini - Main entry point
import { authenticate } from './users';
import { UserRepository } from './users';

const main = async () => {
  const user = authenticate('test@example.com', 'secret');
  if (user) {
    console.log('Logged in:', user.email);
    const repo = new UserRepository();
    const found = repo.findById(user.id);
    console.log('Found:', found);
  } else {
    console.log('Invalid credentials');
  }
};

main();
