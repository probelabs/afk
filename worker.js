// Cloudflare Worker for routing probelabs.com/afk/* to AFK Pages site
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Check if this is a request to probelabs.com/afk or /afk/*
    if (url.hostname === 'probelabs.com' && url.pathname.startsWith('/afk')) {
      // Handle /afk without trailing slash by redirecting to /afk/
      if (url.pathname === '/afk') {
        return Response.redirect(url.origin + '/afk/', 301);
      }
      
      // Remove /afk from the path and proxy to the Pages site
      const newPath = url.pathname.replace('/afk', '') || '/';
      const pagesUrl = `https://33fced85.afk-site.pages.dev${newPath}${url.search}`;
      
      // Fetch from the Pages deployment
      const response = await fetch(pagesUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      
      // Create new response with same content but updated headers
      const newResponse = new Response(response.body, response);
      
      // Update any absolute links in HTML content to include /afk prefix
      if (response.headers.get('content-type')?.includes('text/html')) {
        const html = await response.text();
        const updatedHtml = html
          .replace(/href="\//g, 'href="/afk/')
          .replace(/src="\//g, 'src="/afk/')
          .replace(/url\(\//g, 'url(/afk/');
        return new Response(updatedHtml, {
          status: response.status,
          headers: response.headers
        });
      }
      
      return newResponse;
    }
    
    // For any other requests, pass through
    return fetch(request);
  },
};