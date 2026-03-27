import { describe, expect, test } from 'bun:test'
import { detectSpa } from '../../../src/pipeline/fetcher/spa-detector'

describe('detectSpa', () => {
  test('returns false for static HTML with content', () => {
    const html = `
      <html><body>
        <h1>API Documentation</h1>
        <p>This is a full page with plenty of text content for the documentation.</p>
        <h2>GET /users</h2>
        <p>Returns a list of users with pagination support and filtering options.</p>
      </body></html>
    `
    expect(detectSpa(html)).toBe(false)
  })

  test('returns true for empty root div', () => {
    const html = `
      <html><body>
        <div id="root"></div>
        <script src="/app.js"></script>
      </body></html>
    `
    expect(detectSpa(html)).toBe(true)
  })

  test('returns true for empty app div', () => {
    const html = `
      <html><body>
        <div id="app"></div>
      </body></html>
    `
    expect(detectSpa(html)).toBe(true)
  })

  test('returns true for noscript tag', () => {
    const html = `
      <html><body>
        <noscript>You need to enable JavaScript to run this app.</noscript>
        <div id="root"></div>
      </body></html>
    `
    expect(detectSpa(html)).toBe(true)
  })

  test('returns true for body with very little text', () => {
    const html = `
      <html><body>
        <script src="/bundle.js"></script>
        <style>body { margin: 0; }</style>
        Loading...
      </body></html>
    `
    expect(detectSpa(html)).toBe(true)
  })

  test('returns false for page with noscript but also content', () => {
    const html = `
      <html><body>
        <noscript>Enable JS for full experience</noscript>
        <h1>API Documentation</h1>
        <p>This page has real content rendered server-side with enough text to pass the threshold.</p>
        <h2>Endpoints</h2>
        <p>The following endpoints are available for use in your application integration.</p>
      </body></html>
    `
    expect(detectSpa(html)).toBe(false)
  })
})
