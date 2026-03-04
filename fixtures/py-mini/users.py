# fixtures/py-mini - Simple Python project

class User:
    def __init__(self, user_id, email):
        self.id = user_id
        self.email = email

    def __repr__(self):
        return f"User({self.id}, {self.email})"

class UserRepository:
    def __init__(self):
        self.users = []

    def find_by_id(self, user_id):
        for u in self.users:
            if u.id == user_id:
                return u
        return None

    def find_by_email(self, email):
        for u in self.users:
            if u.email == email:
                return u
        return None

    def save(self, user):
        self.users.append(user)

    def get_all(self):
        return list(self.users)

def create_user(email, user_id=None):
    if user_id is None:
        user_id = hash(email) % 10000
    return User(user_id, email)

def login_user(email, password):
    """Simplified login without real password check"""
    repo = UserRepository()
    # In real app, would fetch from DB; here we simulate
    user = User(1, email)
    return user

def authenticate(email, pwd):
    user = login_user(email, pwd)
    if user:
        return user
    return None

if __name__ == '__main__':
    repo = UserRepository()
    user = create_user('test@example.com', 1)
    repo.save(user)
    print('Users:', repo.get_all())
