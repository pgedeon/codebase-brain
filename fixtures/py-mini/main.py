# fixtures/py-mini - Main module
from users import authenticate, UserRepository, create_user

def main():
    user = authenticate('test@example.com', 'secret')
    if user:
        print(f'Logged in: {user.email}')
        repo = UserRepository()
        repo.save(create_user('another@example.com', 2))
        print('All users:', repo.get_all())
    else:
        print('Invalid credentials')

if __name__ == '__main__':
    main()
