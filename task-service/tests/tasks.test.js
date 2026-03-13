const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');

let mongoServer;

const makeToken = (userId = 'user123') =>
  jwt.sign({ userId, email: 'test@example.com' }, 'dev_secret_key', {
    expiresIn: '1h',
  });

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('GET /health', () => {
  it('should return healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('task-service');
  });
});

describe('Task CRUD (authenticated)', () => {
  let token;

  beforeEach(() => {
    token = makeToken('user_test_1');
  });

  describe('POST /api/tasks', () => {
    it('should create a task', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'My first task', description: 'Do something' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('My first task');
      expect(res.body.status).toBe('todo');
      expect(res.body.userId).toBe('user_test_1');
    });

    it('should fail without title', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'No title here' });

      expect(res.status).toBe(400);
    });

    it('should fail without token', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'Task without auth' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/tasks', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task 1' });

      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task 2', status: 'done' });
    });

    it('should list all tasks for the user', async () => {
      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    it('should filter tasks by status', async () => {
      const res = await request(app)
        .get('/api/tasks?status=done')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toBe('Task 2');
    });

    it('should not return tasks of another user', async () => {
      const otherToken = makeToken('other_user');
      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(0);
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('should update a task', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'To update' });

      const taskId = createRes.body._id;

      const res = await request(app)
        .put(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated', status: 'in-progress' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated');
      expect(res.body.status).toBe('in-progress');
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should delete a task', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'To delete' });

      const taskId = createRes.body._id;

      const res = await request(app)
        .delete(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Task deleted');
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .delete('/api/tasks/000000000000000000000000')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
