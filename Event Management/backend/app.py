from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///events.db"
app.config["JWT_SECRET_KEY"] = "change-this-to-a-long-random-secret-key"
db = SQLAlchemy(app)
JWTManager(app)
CORS(app)



class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "email": self.email, "is_admin": self.is_admin}


class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, default="")
    date_time = db.Column(db.DateTime, nullable=False)
    venue = db.Column(db.String(150), nullable=False)
    capacity = db.Column(db.Integer, nullable=False)
    category = db.Column(db.String(50), default="General")
    registrations = db.relationship("Registration", backref="event", cascade="all, delete-orphan")

    def to_dict(self):
        taken = len(self.registrations)
        return {"id": self.id, "title": self.title, "description": self.description,
                "date_time": self.date_time.isoformat(), "venue": self.venue,
                "capacity": self.capacity, "category": self.category,
                "registered": taken, "spots_left": self.capacity - taken}


class Registration(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), nullable=False)
    __table_args__ = (db.UniqueConstraint("user_id", "event_id"),)  # blocks duplicates



def err(msg, code):
    return jsonify(error=msg), code


def fill(event, d):
    for f in ("title", "description", "venue", "capacity", "category"):
        if f in d:
            event.__setattr__(f, d[f])
    if "date_time" in d:
        event.date_time = datetime.fromisoformat(d["date_time"])



@app.post("/api/signup")
def signup():
    d = request.json or {}
    if not all(d.get(k) for k in ("name", "email", "password")):
        return err("name, email and password are required", 400)
    user = User(name=d["name"], email=d["email"].lower(), password_hash=generate_password_hash(d["password"]))
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return err("Email already registered", 409)
    return jsonify(user.to_dict()), 201


@app.post("/api/login")
def login():
    d = request.json or {}
    user = User.query.filter_by(email=d.get("email", "").lower()).first()
    if not user or not check_password_hash(user.password_hash, d.get("password", "")):
        return err("Invalid email or password", 401)
    token = create_access_token(identity=str(user.id), additional_claims={"admin": user.is_admin})
    return jsonify(token=token, user=user.to_dict())


@app.get("/api/events")
def list_events():
    q = Event.query
    if s := request.args.get("search"):
        q = q.filter(Event.title.ilike(f"%{s}%"))
    if c := request.args.get("category"):
        q = q.filter_by(category=c)
    return jsonify([e.to_dict() for e in q.order_by(Event.date_time)])


@app.get("/api/events/<int:id>")
def get_event(id):
    return jsonify(db.get_or_404(Event, id).to_dict())


@app.post("/api/events")
@jwt_required()
def create_event():
    if not get_jwt()["admin"]:
        return err("Admin only", 403)
    d = request.json or {}
    if not all(d.get(k) for k in ("title", "venue", "capacity", "date_time")):
        return err("title, venue, capacity and date_time are required", 400)
    event = Event()
    fill(event, d)
    db.session.add(event)
    db.session.commit()
    return jsonify(event.to_dict()), 201


@app.put("/api/events/<int:id>")
@jwt_required()
def update_event(id):
    if not get_jwt()["admin"]:
        return err("Admin only", 403)
    event = db.get_or_404(Event, id)
    d = request.json or {}
    if int(d.get("capacity", event.capacity)) < len(event.registrations):
        return err("Capacity cannot be below current registrations", 400)
    fill(event, d)
    db.session.commit()
    return jsonify(event.to_dict())


@app.delete("/api/events/<int:id>")
@jwt_required()
def delete_event(id):
    if not get_jwt()["admin"]:
        return err("Admin only", 403)
    db.session.delete(db.get_or_404(Event, id))
    db.session.commit()
    return "", 204



@app.post("/api/events/<int:id>/register")
@jwt_required()
def register_event(id):
    event = db.get_or_404(Event, id)
    if event.date_time < datetime.now():
        return err("This event has already started", 400)
    if len(event.registrations) >= event.capacity:
        return err("Event is full", 409)
    db.session.add(Registration(user_id=int(get_jwt_identity()), event_id=id))
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return err("You are already registered", 409)
    return jsonify(event.to_dict()), 201


@app.delete("/api/events/<int:id>/register")
@jwt_required()
def unregister_event(id):
    reg = Registration.query.filter_by(user_id=int(get_jwt_identity()), event_id=id).first()
    if not reg:
        return err("You are not registered for this event", 404)
    db.session.delete(reg)
    db.session.commit()
    return "", 204


@app.get("/api/my-registrations")
@jwt_required()
def my_registrations():
    regs = Registration.query.filter_by(user_id=int(get_jwt_identity())).all()
    return jsonify([r.event.to_dict() for r in regs])


with app.app_context():
    db.create_all()
    if not User.query.filter_by(is_admin=True).first():
        db.session.add(User(name="Admin", email="admin@example.com",
                            password_hash=generate_password_hash("admin123"), is_admin=True))
        db.session.commit()

if __name__ == "__main__":
    app.run(debug=True)