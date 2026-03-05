// Jest test setup for jsdom environment
// This file is loaded after Jest environment is set up

// Mock localStorage
const localStorageMock = {
  store: {},
  getItem(key) {
    return this.store[key] || null;
  },
  setItem(key, value) {
    this.store[key] = value;
  },
  removeItem(key) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  }
};

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock fetch for SVG parser tests (using function instead of jest.fn for setup file)
const mockFetch = () =>
  Promise.resolve({
    ok: true,
    text: () => Promise.resolve('<svg><rect id="test_element" /></svg>')
  });

global.fetch = mockFetch;

// Reset DOM before each test
beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.dir = 'ltr';
  document.documentElement.lang = 'en';
  localStorageMock.clear();
});
