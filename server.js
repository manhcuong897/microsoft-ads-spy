const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const app = express();
const PORT = process.env.PORT || 3030;

// Cache Configuration (24 hours expiration)
const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 hour in milliseconds

// Ensure cache directory exists synchronously on startup
if (!fsSync.existsSync(CACHE_DIR)) {
  fsSync.mkdirSync(CACHE_DIR, { recursive: true });
}

// Cache helper: Read from local JSON file
async function getCache(key) {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const cached = JSON.parse(content);
    const age = Date.now() - cached.timestamp;
    if (age < CACHE_DURATION) {
      console.log(`[Cache Hit] Key: ${key} (Age: ${Math.round(age / 1000 / 60)} mins)`);
      return cached.data;
    }
    console.log(`[Cache Expired] Key: ${key}`);
    await fs.unlink(filePath).catch(() => {}); // Clean up expired cache
  } catch (err) {
    // File doesn't exist or JSON parsing failed, return null silently
  }
  return null;
}

// Cache helper: Write to local JSON file
async function setCache(key, data) {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  try {
    const cached = {
      timestamp: Date.now(),
      data
    };
    await fs.writeFile(filePath, JSON.stringify(cached, null, 2), 'utf8');
    console.log(`[Cache Set] Key: ${key}`);
  } catch (err) {
    console.error(`Error writing cache for key ${key}:`, err.message);
  }
}

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Rate-limiting concurrency helper to limit parallel requests and enforce a minimum start interval
async function limitConcurrency(tasks, limit, minIntervalMs = 400) {
  const results = [];
  let nextAvailableTime = Date.now();
  
  // Wrap tasks with index to maintain order
  const queue = tasks.map((task, index) => ({ task, index }));
  
  const workers = Array(limit).fill(null).map(async () => {
    while (queue.length > 0) {
      const { task, index } = queue.shift();
      
      const now = Date.now();
      let delay = 0;
      if (now < nextAvailableTime) {
        delay = nextAvailableTime - now;
        nextAvailableTime += minIntervalMs;
      } else {
        nextAvailableTime = now + minIntervalMs;
      }
      
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      results[index] = await task();
    }
  });
  
  await Promise.all(workers);
  return results;
}

// Fetch helper with User-Agent spoofing, content-type checks, and automatic exponential backoff retries
async function fetchWithRetry(url, options = {}, retries = 3, initialDelay = 1500) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Referer': 'https://adlibrary.ads.microsoft.com/',
    'Origin': 'https://adlibrary.ads.microsoft.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    ...options.headers
  };
  
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, { ...options, headers });
      const contentType = response.headers.get('content-type') || '';
      
      // If response is successful and is JSON, return it
      if (response.ok && contentType.includes('application/json')) {
        return response;
      }
      
      const isRateLimited = response.status === 429;
      const isServerError = response.status >= 500;
      const isHtmlBlock = contentType.includes('text/html');
      
      if (isRateLimited || isServerError || isHtmlBlock || !response.ok) {
        if (i < retries) {
          const backoffDelay = initialDelay * Math.pow(2, i);
          console.warn(`[API Warning] Fetch failed (status: ${response.status}, content-type: ${contentType}). Retrying in ${backoffDelay}ms for URL: ${url}`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        }
      }
      return response;
    } catch (error) {
      if (i < retries) {
        const backoffDelay = initialDelay * Math.pow(2, i);
        console.warn(`[API Warning] Fetch error (${error.message}). Retrying in ${backoffDelay}ms for URL: ${url}`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        continue;
      }
      throw error;
    }
  }
}


// 1. Get Advertiser Details (Verify Advertiser Availability)
app.get('/api/advertiser/:id', async (req, res) => {
  const advertiserId = req.params.id;
  
  if (!/^\d+$/.test(advertiserId)) {
    return res.status(400).json({ error: 'Mã nhà quảng cáo không hợp lệ. Vui lòng chỉ nhập số.' });
  }

  try {
    const cacheKey = `advertiser_${advertiserId}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const advertiserUrl = `https://adlibrary.api.bingads.microsoft.com/api/v1/Advertisers(${advertiserId})`;
    const countUrl = `https://adlibrary.api.bingads.microsoft.com/api/v1/Ads?advertiserId=${advertiserId}&top=1&$count=true`;

    const [response, countResponse] = await Promise.all([
      fetchWithRetry(advertiserUrl),
      fetchWithRetry(countUrl).catch(err => {
        console.error(`Error fetching ad count:`, err.message);
        return null;
      })
    ]);

    if (response.status === 404) {
      return res.status(404).json({ error: `Không tìm thấy nhà quảng cáo với ID ${advertiserId}` });
    }

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Lỗi API Microsoft Ads: ${response.statusText}`, details: errorText });
    }

    const advertiser = await response.json();
    let totalAds = 0;
    if (countResponse && countResponse.ok) {
      try {
        const countData = await countResponse.json();
        totalAds = countData['@odata.count'] || 0;
      } catch (err) {
        console.error(`Error parsing count response:`, err.message);
      }
    }

    const responseData = {
      advertiserId: advertiser.AdvertiserId,
      advertiserName: advertiser.AdvertiserName,
      advertiserCountry: advertiser.AdvertiserCountry,
      isVerified: advertiser.IsVerified || false,
      totalAds
    };

    await setCache(cacheKey, responseData);
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching advertiser:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống khi kiểm tra nhà quảng cáo.' });
  }
});

// 2. Get Advertiser Campaigns
app.get('/api/advertiser/:id/campaigns', async (req, res) => {
  const advertiserId = req.params.id;
  const limit = parseInt(req.query.limit) || 50;

  if (!/^\d+$/.test(advertiserId)) {
    return res.status(400).json({ error: 'Mã nhà quảng cáo không hợp lệ.' });
  }

  try {
    const cacheKey = `campaigns_${advertiserId}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      if (cachedData.campaigns.length >= limit || cachedData.fullyFetched) {
        console.log(`[Cache Hit-Campaigns] Returning ${Math.min(cachedData.campaigns.length, limit)} campaigns for advertiser ${advertiserId}`);
        return res.json({ campaigns: cachedData.campaigns.slice(0, limit) });
      }
    }

    // Fetch total count of ads to calculate skip offset for retrieving newest ads
    const countUrl = `https://adlibrary.api.bingads.microsoft.com/api/v1/Ads?advertiserId=${advertiserId}&top=1&$count=true`;
    const countRes = await fetchWithRetry(countUrl).catch(err => {
      console.error(`Error fetching ad count in campaigns:`, err.message);
      return null;
    });
    
    let totalAds = 0;
    if (countRes && countRes.ok) {
      try {
        const countData = await countRes.json();
        totalAds = countData['@odata.count'] || 0;
      } catch (err) {
        console.error(`Error parsing count response in campaigns:`, err.message);
      }
    }

    // Fetch basic ads list using pagination (max 24 per page)
    const ads = [];
    const maxPageSize = 24;
    // Bắt đầu cào từ vị trí 0 để lấy các quảng cáo mới nhất vừa được duyệt
    let skip = 0;
    let fullyFetched = false;
    
    while (ads.length < limit) {
      const currentTop = Math.min(maxPageSize, limit - ads.length);
      const adsListUrl = new URL('https://adlibrary.api.bingads.microsoft.com/api/v1/Ads');
      adsListUrl.searchParams.append('advertiserId', advertiserId);
      adsListUrl.searchParams.append('top', currentTop.toString());
      adsListUrl.searchParams.append('skip', skip.toString());

      const adsRes = await fetchWithRetry(adsListUrl);
      if (!adsRes.ok) {
        if (ads.length > 0) break;
        return res.status(adsRes.status).json({ error: 'Không thể tải danh sách quảng cáo từ Microsoft Ads Library.' });
      }

      const adsData = await adsRes.json();
      const pageAds = adsData.value || [];
      if (pageAds.length === 0) {
        fullyFetched = true;
        break;
      }
      
      ads.push(...pageAds);
      
      if (pageAds.length < currentTop) {
        fullyFetched = true;
        break;
      }

      skip += pageAds.length;
      if (skip > 999) {
        fullyFetched = true;
        break;
      }
    }

    if (ads.length === 0) {
      const responseData = { campaigns: [], fullyFetched: true };
      await setCache(cacheKey, responseData);
      return res.json({ campaigns: [] });
    }

    // Step B: Fetch details for each ad sequentially with 400ms start interval to avoid hitting rate limits / WAF blocks
    const tasks = ads.map((ad, idx) => async () => {
      try {
        const detailUrl = `https://adlibrary.api.bingads.microsoft.com/api/v1/Ads(${ad.AdId})?expand=AdDetails`;
        const detailRes = await fetchWithRetry(detailUrl, {}, 3, 1500);
        if (detailRes && detailRes.ok) {
          const detailData = await detailRes.json();
          return {
            ...ad,
            AdDetails: detailData.AdDetails || null,
            detailsFetchFailed: false
          };
        } else {
          console.error(`Error details fetch failed for Ad ${ad.AdId}: Status ${detailRes ? detailRes.status : 'unknown'}`);
        }
      } catch (err) {
        console.error(`Error fetching details for Ad ${ad.AdId}:`, err.message);
      }
      return { ...ad, AdDetails: null, detailsFetchFailed: true };
    });

    const detailedAds = await limitConcurrency(tasks, 1, 400);

    // Step C: Normalize & Format data for the frontend
    const normalizedCampaigns = detailedAds.map(ad => {
      // 1. Tên dự án (Headline or Description)
      const projectName = ad.Title || ad.Description || 'Không có tiêu đề';
      
      // 2. Domain (Landing page domain)
      let domain = 'Không xác định';
      if (ad.DestinationUrl) {
        try {
          domain = new URL(ad.DestinationUrl).hostname.replace(/^www\./, '');
        } catch (e) {
          domain = ad.DisplayUrl || 'Không xác định';
        }
      } else if (ad.DisplayUrl) {
        domain = ad.DisplayUrl;
      }

      // 3 & 4. Ngày bắt đầu, kết thúc
      const startDate = ad.AdDetails?.StartDate || null;
      const endDate = ad.AdDetails?.EndDate || null;

      // 5. Số ngày chạy
      let runDays = 0;
      if (startDate) {
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date();
        const diffTime = end - start;
        if (diffTime > 0) {
          runDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } else {
          runDays = 1; // If ended on the same day
        }
      }

      // 6. Phân loại quảng cáo (Text, Image, Video)
      let adCategory = 'Tìm kiếm (Văn bản)';
      let mediaUrls = [];
      if (ad.AssetJson) {
        try {
          const assets = JSON.parse(ad.AssetJson);
          const hasVideo = assets.some(asset => asset.AssetType === 'Video');
          const hasImage = assets.some(asset => asset.AssetType === 'Image');
          if (hasVideo) {
            adCategory = 'Video';
          } else if (hasImage) {
            adCategory = 'Hình ảnh';
          }
          mediaUrls = assets.map(asset => asset.AssetUrl).filter(Boolean);
        } catch (e) {
          // Fallback if JSON parsing fails
        }
      }

      // 7. Trạng thái (Đang hoạt động / Đã kết thúc)
      let status = 'Đã kết thúc';
      if (ad.detailsFetchFailed) {
        status = 'Không xác định (Lỗi tải)';
      } else if (ad.AdDetails) {
        if (!endDate) {
          status = 'Đang hoạt động';
        } else {
          const end = new Date(endDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0); // Start of today
          
          // Allow 1-day timezone / grace limit offset (e.g. ended yesterday is still considered active/running today)
          const graceLimit = new Date(today.getTime() - 24 * 60 * 60 * 1000);
          if (end >= graceLimit) {
            status = 'Đang hoạt động';
          }
        }
      }

      // 8. Liên kết mẫu quảng cáo & Landing Page
      const adLibraryPreviewUrl = `https://adlibrary.ads.microsoft.com/ad/${ad.AdId}`;
      const landingPageUrl = ad.DestinationUrl || null;

      return {
        adId: ad.AdId,
        projectName,
        title: ad.Title,
        description: ad.Description,
        domain,
        startDate,
        endDate,
        runDays,
        adCategory,
        status,
        adLibraryPreviewUrl,
        landingPageUrl,
        mediaUrls
      };
    });

    const responseData = {
      campaigns: normalizedCampaigns,
      fullyFetched
    };

    await setCache(cacheKey, responseData);
    res.json({ campaigns: normalizedCampaigns });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy danh sách chiến dịch quảng cáo.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Microsoft Ads Spy Server running at http://localhost:${PORT}`);
});
