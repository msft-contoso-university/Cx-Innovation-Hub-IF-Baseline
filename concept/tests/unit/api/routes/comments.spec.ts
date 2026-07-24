import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  require,
  Module,
  originalLoad,
  makeMockRes,
  routeHandle,
  loadRouterWithMockedDb,
} from './_helpers';

const commentsPath = require.resolve('../../../../apps/api/src/routes/comments.js');
const dbPath = require.resolve('../../../../apps/api/src/services/database.js');

let mockQuery: ReturnType<typeof vi.fn>;
let router: { handle: Function };

beforeEach(async () => {
  vi.clearAllMocks();
  mockQuery = vi.fn();
  router = await loadRouterWithMockedDb(commentsPath, dbPath, mockQuery);
});

afterEach(() => {
  Module._load = originalLoad;
  delete require.cache[commentsPath];
});

// ---------------------------------------------------------------------------
// POST /tasks/:taskId/comments – header + content validation
// ---------------------------------------------------------------------------
describe('POST /tasks/:taskId/comments', () => {
  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const req = {
      method: 'POST',
      url: '/tasks/task-1/comments',
      headers: {},
      body: { content: 'Hello' },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'X-User-Id header is required' }),
    );
  });

  it('returns 400 when content is empty', async () => {
    // Arrange
    const req = {
      method: 'POST',
      url: '/tasks/task-1/comments',
      headers: { 'x-user-id': 'user-1' },
      body: { content: '' },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Comment content is required' }),
    );
  });

  it('returns 400 when content is blank whitespace', async () => {
    // Arrange
    const req = {
      method: 'POST',
      url: '/tasks/task-1/comments',
      headers: { 'x-user-id': 'user-1' },
      body: { content: '   ' },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Comment content is required' }),
    );
  });
});

// ---------------------------------------------------------------------------
// PUT /comments/:id – authorization ownership check
// ---------------------------------------------------------------------------
describe('PUT /comments/:id', () => {
  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const req = {
      method: 'PUT',
      url: '/comments/cmt-1',
      headers: {},
      body: { content: 'Updated' },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'X-User-Id header is required' }),
    );
  });

  it('returns 404 when comment does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValue({ rows: [] });
    const req = {
      method: 'PUT',
      url: '/comments/no-such-comment',
      headers: { 'x-user-id': 'user-1' },
      body: { content: 'Updated' },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, message: 'Comment not found' }),
    );
  });

  it('returns 403 when the requester is not the comment author', async () => {
    // Arrange – DB returns a comment owned by a different user
    mockQuery.mockResolvedValue({ rows: [{ user_id: 'author-user' }] });
    const req = {
      method: 'PUT',
      url: '/comments/cmt-1',
      headers: { 'x-user-id': 'other-user' },
      body: { content: 'Attempted edit' },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, message: 'You can only edit your own comments' }),
    );
  });

  it('returns 400 when content is empty after ownership check passes', async () => {
    // Arrange – DB returns a comment owned by the requesting user
    mockQuery.mockResolvedValue({ rows: [{ user_id: 'user-1' }] });
    const req = {
      method: 'PUT',
      url: '/comments/cmt-1',
      headers: { 'x-user-id': 'user-1' },
      body: { content: '' },
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'Comment content is required' }),
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /comments/:id – authorization ownership check
// ---------------------------------------------------------------------------
describe('DELETE /comments/:id', () => {
  it('returns 400 when X-User-Id header is missing', async () => {
    // Arrange
    const req = {
      method: 'DELETE',
      url: '/comments/cmt-1',
      headers: {},
      body: {},
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, message: 'X-User-Id header is required' }),
    );
  });

  it('returns 404 when comment does not exist', async () => {
    // Arrange
    mockQuery.mockResolvedValue({ rows: [] });
    const req = {
      method: 'DELETE',
      url: '/comments/no-such-comment',
      headers: { 'x-user-id': 'user-1' },
      body: {},
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, message: 'Comment not found' }),
    );
  });

  it('returns 403 when the requester is not the comment author', async () => {
    // Arrange – DB returns a comment owned by a different user
    mockQuery.mockResolvedValue({ rows: [{ user_id: 'author-user' }] });
    const req = {
      method: 'DELETE',
      url: '/comments/cmt-1',
      headers: { 'x-user-id': 'other-user' },
      body: {},
      params: {},
      query: {},
    };
    const res = makeMockRes();

    // Act
    const { next } = await routeHandle(router, req, res);

    // Assert
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, message: 'You can only delete your own comments' }),
    );
  });
});
