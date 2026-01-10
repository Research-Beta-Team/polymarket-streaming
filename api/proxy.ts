import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Vercel rewrites: /api/polymarket/:path* -> /api/proxy/:path*
  // Extract the API path from the request URL
  let apiPath = '';
  
  // Method 1: Extract from URL path (most reliable)
  if (req.url) {
    const urlParts = req.url.split('?');
    const pathPart = urlParts[0];
    
    // Remove /api/proxy prefix to get the actual API path
    if (pathPart.startsWith('/api/proxy/')) {
      apiPath = pathPart.replace('/api/proxy/', '');
    } else if (pathPart.startsWith('/api/proxy')) {
      apiPath = pathPart.replace('/api/proxy', '');
    }
  }
  
  // Method 2: Fallback to query parameter if URL extraction didn't work
  if (!apiPath && req.query.path) {
    const pathParam = req.query.path;
    apiPath = Array.isArray(pathParam) ? pathParam.join('/') : pathParam;
  }
  
  // Construct the full URL
  const baseUrl = `https://gamma-api.polymarket.com/${apiPath}`;
  
  // Forward query parameters (excluding 'path' if it was used)
  const queryParams = new URLSearchParams();
  Object.entries(req.query).forEach(([key, value]) => {
    if (key !== 'path' && value) {
      if (Array.isArray(value)) {
        value.forEach(v => queryParams.append(key, String(v)));
      } else {
        queryParams.append(key, String(value));
      }
    }
  });
  
  const fullUrl = queryParams.toString() 
    ? `${baseUrl}?${queryParams.toString()}`
    : baseUrl;
  
  // Log for debugging (remove in production if needed)
  if (process.env.NODE_ENV === 'development') {
    console.log(`Proxying request: ${fullUrl}`);
  }

  if (!apiPath) {
    return res.status(400).json({
      error: 'No API path provided',
      url: req.url,
      query: req.query,
    });
  }

  try {
    const response = await fetch(fullUrl, {
      method: req.method || 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: `API returned ${response.status}`,
        status: response.status,
        details: errorText,
      });
    }

    const data = await response.json();
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({
      error: 'Failed to fetch from Polymarket API',
      message: error instanceof Error ? error.message : 'Unknown error',
      url: fullUrl,
    });
  }
}
