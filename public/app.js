// Core Frontend logic for MS Ads Spy Tool

// State variables
let advertiserData = null;
let allCampaigns = [];
let filteredCampaigns = [];
let currentView = 'card'; // 'card' or 'table'

// DOM Elements
const searchForm = document.getElementById('search-form');
const advertiserIdInput = document.getElementById('advertiser-id');
const limitSelect = document.getElementById('limit-select');
const searchBtn = document.getElementById('search-btn');

// View panels
const welcomePanel = document.getElementById('welcome-panel');
const loadingPanel = document.getElementById('loading-panel');
const errorPanel = document.getElementById('error-panel');
const dashboardResults = document.getElementById('dashboard-results');
const noResultsPanel = document.getElementById('no-results-panel');
const apiWarningBanner = document.getElementById('api-warning-banner');
const failedDetailsCount = document.getElementById('failed-details-count');

// Loading state details
const loadingTitle = document.getElementById('loading-title');
const loadingDesc = document.getElementById('loading-desc');
const errorMessage = document.getElementById('error-message');

// Advertiser details
const advertiserInfoPanel = document.getElementById('advertiser-info-panel');
const advName = document.getElementById('adv-name');
const advId = document.getElementById('adv-id');
const advCountry = document.getElementById('adv-country');
const advVerified = document.getElementById('adv-verified');
const advTotalAds = document.getElementById('adv-total-ads');

// Stats
const statTotalCampaigns = document.getElementById('stat-total-campaigns');
const statActiveCampaigns = document.getElementById('stat-active-campaigns');
const statCompletedCampaigns = document.getElementById('stat-completed-campaigns');
const statUniqueDomains = document.getElementById('stat-unique-domains');

// Filters & Sorting
const filterSearch = document.getElementById('filter-search');
const filterStatus = document.getElementById('filter-status');
const filterType = document.getElementById('filter-type');
const sortBy = document.getElementById('sort-by');
const campaignsContainer = document.getElementById('campaigns-list-container');
const campaignsTableContainer = document.getElementById('campaigns-table-container');
const campaignsTableBody = document.getElementById('campaigns-table-body');

// View Action buttons
const btnViewCard = document.getElementById('btn-view-card');
const btnViewTable = document.getElementById('btn-view-table');
const btnExportCsv = document.getElementById('btn-export-csv');

// Lightbox
const lightbox = document.getElementById('image-lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxCaption = document.getElementById('lightbox-caption');

// Helper to format dates to Vietnamese locale format (DD/MM/YYYY)
function formatDate(dateString, isEnd = false) {
  if (!dateString) return isEnd ? 'Đang chạy' : 'Không xác định';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Helper to escape HTML to prevent XSS
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Helper to escape JS strings for inline event handlers
function escapeJS(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// Show specific panel, hide others
function showPanel(panel) {
  const panels = [welcomePanel, loadingPanel, errorPanel, dashboardResults];
  panels.forEach(p => {
    if (p === panel) {
      p.classList.remove('hidden');
    } else {
      p.classList.add('hidden');
    }
  });
}

// Show skeleton loaders in the campaign container/table
function renderSkeletons() {
  if (currentView === 'card') {
    campaignsContainer.classList.remove('hidden');
    campaignsTableContainer.classList.add('hidden');
    campaignsContainer.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const skeletonCard = document.createElement('div');
      skeletonCard.className = 'glass-card skeleton-card';
      skeletonCard.innerHTML = `
        <div class="skeleton skeleton-media"></div>
        <div class="skeleton skeleton-text" style="width: 40%"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text short"></div>
        <div class="skeleton skeleton-text" style="margin-top: 20px; height: 40px"></div>
      `;
      campaignsContainer.appendChild(skeletonCard);
    }
  } else {
    campaignsContainer.classList.add('hidden');
    campaignsTableContainer.classList.remove('hidden');
    campaignsTableBody.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: center;"><div class="skeleton skeleton-text" style="width: 20px; margin: 0 auto;"></div></td>
        <td>
          <div class="skeleton skeleton-text" style="width: 70%"></div>
          <div class="skeleton skeleton-text short" style="width: 50%"></div>
        </td>
        <td><div class="skeleton skeleton-text" style="width: 80px"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 70px"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 80px"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 75px"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 75px"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 40px; margin: 0 auto;"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 44px; height: 44px; margin: 0 auto; border-radius: 4px;"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 80px; height: 28px; margin: 0 auto; border-radius: 4px;"></div></td>
      `;
      campaignsTableBody.appendChild(tr);
    }
  }
}

// Event handler for Search submission
searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = advertiserIdInput.value.trim();
  const limit = limitSelect.value;
  
  if (!id) return;
  
  // Update UI to loading
  searchBtn.disabled = true;
  loadingTitle.textContent = 'Đang xác thực nhà quảng cáo...';
  loadingDesc.textContent = `Hệ thống đang kiểm tra ID ${id} trên hệ thống Microsoft Ads...`;
  showPanel(loadingPanel);
  advertiserInfoPanel.classList.add('hidden');
  
  try {
    // Phase 1: Verify Advertiser
    const advRes = await fetch(`/api/advertiser/${id}`);
    
    if (!advRes.ok) {
      const errData = await advRes.json();
      throw new Error(errData.error || `Lỗi xác thực nhà quảng cáo (Mã lỗi ${advRes.status})`);
    }
    
    advertiserData = await advRes.json();
    
    // Update Advertiser Info Card
    advName.textContent = advertiserData.advertiserName;
    advId.textContent = advertiserData.advertiserId;
    advCountry.textContent = advertiserData.advertiserCountry || 'Chưa xác định';
    advVerified.innerHTML = advertiserData.isVerified 
      ? '<span class="badge status-active"><i class="fa-solid fa-circle-check"></i> Đã xác minh</span>' 
      : '<span class="badge status-completed"><i class="fa-solid fa-circle-question"></i> Chưa xác minh</span>';
    if (advTotalAds) {
      advTotalAds.textContent = advertiserData.totalAds !== undefined ? advertiserData.totalAds.toLocaleString('vi-VN') : 'Chưa xác định';
    }
    
    advertiserInfoPanel.classList.remove('hidden');
    
    // Phase 2: Fetch campaigns
    loadingTitle.textContent = 'Đang quét chiến dịch quảng cáo...';
    loadingDesc.textContent = `Đang do thám tối đa ${limit} chiến dịch của đối thủ "${advertiserData.advertiserName}". Vui lòng chờ...`;
    
    const campaignsRes = await fetch(`/api/advertiser/${id}/campaigns?limit=${limit}`);
    
    if (!campaignsRes.ok) {
      throw new Error('Lỗi khi truy xuất danh sách quảng cáo. Vui lòng kiểm tra lại.');
    }
    
    const campaignsData = await campaignsRes.json();
    allCampaigns = campaignsData.campaigns || [];
    
    // Update Stats panel
    updateStats(allCampaigns);
    
    // Setup filter/search states
    filterSearch.value = '';
    filterStatus.value = 'all';
    filterType.value = 'all';
    sortBy.value = 'date-desc';
    
    // Process & Render
    applyFiltersAndSort();
    showPanel(dashboardResults);
    
  } catch (err) {
    console.error(err);
    errorMessage.textContent = err.message;
    showPanel(errorPanel);
  } finally {
    searchBtn.disabled = false;
  }
});

// Update Statistics Row
function updateStats(campaigns) {
  statTotalCampaigns.textContent = campaigns.length;
  
  const activeCount = campaigns.filter(c => c.status === 'Đang hoạt động').length;
  const completedCount = campaigns.filter(c => c.status === 'Đã kết thúc').length;
  const failedCount = campaigns.filter(c => c.status.includes('Không xác định')).length;
  
  statActiveCampaigns.textContent = activeCount;
  statCompletedCampaigns.textContent = completedCount;
  
  if (failedCount > 0) {
    failedDetailsCount.textContent = failedCount;
    apiWarningBanner.classList.remove('hidden');
  } else {
    apiWarningBanner.classList.add('hidden');
  }
  
  const domains = new Set(campaigns.map(c => c.domain).filter(d => d !== 'Không xác định' && d !== 'N/A'));
  statUniqueDomains.textContent = domains.size;
}

// Renders the list of campaigns as cards
function renderCampaigns(campaigns) {
  campaignsContainer.innerHTML = '';
  
  if (campaigns.length === 0) {
    noResultsPanel.classList.remove('hidden');
    return;
  }
  
  noResultsPanel.classList.add('hidden');
  
  campaigns.forEach(ad => {
    const card = document.createElement('div');
    card.className = 'glass-card campaign-card';
    
    // Determine Type Badge
    let typeClass = 'type-text';
    let typeIcon = 'fa-align-left';
    if (ad.adCategory === 'Hình ảnh') {
      typeClass = 'type-image';
      typeIcon = 'fa-image';
    } else if (ad.adCategory === 'Video') {
      typeClass = 'type-video';
      typeIcon = 'fa-video';
    }
    
    // Status Badge
    let statusClass = 'status-completed';
    if (ad.status === 'Đang hoạt động') {
      statusClass = 'status-active';
    } else if (ad.status.includes('Không xác định')) {
      statusClass = 'status-unknown';
    }
    
    // Variables properly escaped for XSS protection
    const safeProjectName = escapeHTML(ad.projectName);
    const safeDescription = escapeHTML(ad.description || 'Không có mô tả chi tiết.');
    const safeDomain = escapeHTML(ad.domain);
    const safeLandingUrl = ad.landingPageUrl ? escapeHTML(ad.landingPageUrl) : '';
    const safeLibraryUrl = escapeHTML(ad.adLibraryPreviewUrl);

    // Media Preview Content
    let mediaHtml = '';
    if (ad.mediaUrls && ad.mediaUrls.length > 0) {
      const safeMediaUrl = escapeHTML(ad.mediaUrls[0]);
      const safeJSMediaUrl = escapeHTML(escapeJS(ad.mediaUrls[0]));
      const safeJSProjectName = escapeHTML(escapeJS(ad.projectName));
      mediaHtml = `
        <div class="card-media" onclick="openLightbox('${safeJSMediaUrl}', '${safeJSProjectName}')">
          <img src="${safeMediaUrl}" alt="${safeProjectName}" loading="lazy">
          <div class="media-zoom-overlay">
            <i class="fa-solid fa-magnifying-glass-plus"></i>
          </div>
        </div>
      `;
    } else {
      // Fallback for search/text-only ads
      mediaHtml = `
        <div class="card-media text-only">
          <div class="text-ad-fallback">
            <i class="fa-solid fa-paragraph"></i>
            <span>Mẫu quảng cáo dạng chữ</span>
          </div>
        </div>
      `;
    }
    
    // Domain link
    let domainLinkHtml = ad.landingPageUrl 
      ? `<a href="${safeLandingUrl}" target="_blank" rel="noopener noreferrer">${safeDomain} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 10px;"></i></a>`
      : safeDomain;

    card.innerHTML = `
      <div class="card-header">
        <span class="badge ${typeClass}"><i class="fa-solid ${typeIcon}"></i> ${escapeHTML(ad.adCategory)}</span>
        <span class="badge ${statusClass}">${escapeHTML(ad.status)}</span>
      </div>
      
      ${mediaHtml}
      
      <div class="card-body">
        <h4 class="card-title" title="${safeProjectName}">${safeProjectName}</h4>
        <p class="card-desc" title="${safeDescription}">${safeDescription}</p>
        
        <div class="card-meta">
          <div class="meta-row">
            <span class="meta-lbl"><i class="fa-solid fa-link"></i> Domain mục tiêu</span>
            <span class="meta-val">${domainLinkHtml}</span>
          </div>
          <div class="meta-row">
            <span class="meta-lbl"><i class="fa-solid fa-calendar-days"></i> Ngày chạy</span>
            <span class="meta-val">${formatDate(ad.startDate, false)} - ${formatDate(ad.endDate, true)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-lbl"><i class="fa-solid fa-clock"></i> Số ngày chạy</span>
            <span class="meta-val days-running">${ad.runDays} ngày</span>
          </div>
        </div>
      </div>
      
      <div class="card-actions">
        <a href="${safeLibraryUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary preview-btn">
          <i class="fa-solid fa-eye"></i> Mẫu quảng cáo
        </a>
        ${ad.landingPageUrl 
          ? `<a href="${safeLandingUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary">
               <i class="fa-solid fa-external-link"></i> Landing Page
             </a>`
          : `<button class="btn-secondary" disabled title="Không có link Landing Page">
               <i class="fa-solid fa-ban"></i> Landing Page
             </button>`
        }
      </div>
    `;
    
    campaignsContainer.appendChild(card);
  });
}

// Renders the list of campaigns as an Excel table
function renderTable(campaigns) {
  campaignsTableBody.innerHTML = '';
  
  if (campaigns.length === 0) {
    noResultsPanel.classList.remove('hidden');
    return;
  }
  
  noResultsPanel.classList.add('hidden');
  
  campaigns.forEach((ad, index) => {
    const tr = document.createElement('tr');
    
    // Determine Type Badge
    let typeClass = 'type-text';
    let typeIcon = 'fa-align-left';
    if (ad.adCategory === 'Hình ảnh') {
      typeClass = 'type-image';
      typeIcon = 'fa-image';
    } else if (ad.adCategory === 'Video') {
      typeClass = 'type-video';
      typeIcon = 'fa-video';
    }
    
    // Status Badge
    let statusClass = 'status-completed';
    if (ad.status === 'Đang hoạt động') {
      statusClass = 'status-active';
    } else if (ad.status.includes('Không xác định')) {
      statusClass = 'status-unknown';
    }
    
    // Variables properly escaped for XSS protection
    const safeProjectName = escapeHTML(ad.projectName);
    const safeDescription = escapeHTML(ad.description || 'Không có mô tả chi tiết.');
    const safeDomain = escapeHTML(ad.domain);
    const safeLandingUrl = ad.landingPageUrl ? escapeHTML(ad.landingPageUrl) : '';
    const safeLibraryUrl = escapeHTML(ad.adLibraryPreviewUrl);

    // Thumbnail content
    let thumbHtml = '';
    if (ad.mediaUrls && ad.mediaUrls.length > 0) {
      const safeMediaUrl = escapeHTML(ad.mediaUrls[0]);
      const safeJSMediaUrl = escapeHTML(escapeJS(ad.mediaUrls[0]));
      const safeJSProjectName = escapeHTML(escapeJS(ad.projectName));
      thumbHtml = `
        <div class="table-thumb" onclick="openLightbox('${safeJSMediaUrl}', '${safeJSProjectName}')">
          <img src="${safeMediaUrl}" alt="Thumb" loading="lazy">
        </div>
      `;
    } else {
      thumbHtml = `
        <div class="table-thumb text-only">
          <i class="fa-solid fa-paragraph"></i>
        </div>
      `;
    }
    
    // Domain link
    let domainLinkHtml = ad.landingPageUrl 
      ? `<a href="${safeLandingUrl}" target="_blank" rel="noopener noreferrer">${safeDomain} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 10px;"></i></a>`
      : safeDomain;

    tr.innerHTML = `
      <td style="text-align: center; font-weight: bold; color: var(--text-muted);">${index + 1}</td>
      <td>
        <div class="table-cell-title" title="${safeProjectName}">${safeProjectName}</div>
        <div class="table-cell-desc" title="${safeDescription}">${safeDescription}</div>
      </td>
      <td class="table-cell-domain">${domainLinkHtml}</td>
      <td><span class="badge ${typeClass}"><i class="fa-solid ${typeIcon}"></i> ${escapeHTML(ad.adCategory)}</span></td>
      <td><span class="badge ${statusClass}">${escapeHTML(ad.status)}</span></td>
      <td>${formatDate(ad.startDate, false)}</td>
      <td>${formatDate(ad.endDate, true)}</td>
      <td style="text-align: center; font-weight: 700; color: var(--color-cyan);">${ad.runDays}</td>
      <td>${thumbHtml}</td>
      <td>
        <div class="table-actions">
          <a href="${safeLibraryUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary preview-btn" title="Xem Mẫu Quảng Cáo">
            <i class="fa-solid fa-eye"></i> Mẫu QC
          </a>
          ${ad.landingPageUrl 
            ? `<a href="${safeLandingUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary" title="Truy cập Landing Page">
                 <i class="fa-solid fa-external-link"></i> Link
               </a>`
            : `<button class="btn-secondary" disabled title="Không có link Landing Page">
                 <i class="fa-solid fa-ban"></i> Link
               </button>`
          }
        </div>
      </td>
    `;
    
    campaignsTableBody.appendChild(tr);
  });
}

// Handle filters and sorting logic
function applyFiltersAndSort() {
  const searchQuery = filterSearch.value.toLowerCase().trim();
  const statusVal = filterStatus.value;
  const typeVal = filterType.value;
  const sortVal = sortBy.value;
  
  // 1. Filter
  filteredCampaigns = allCampaigns.filter(ad => {
    // Search keyword match
    const searchMatch = !searchQuery || 
                        ad.projectName.toLowerCase().includes(searchQuery) || 
                        ad.description.toLowerCase().includes(searchQuery) ||
                        ad.domain.toLowerCase().includes(searchQuery);
                        
    // Status filter match
    let statusMatch = true;
    if (statusVal === 'active') {
      statusMatch = ad.status === 'Đang hoạt động';
    } else if (statusVal === 'completed') {
      statusMatch = ad.status === 'Đã kết thúc';
    }
    
    // Type filter match
    let typeMatch = true;
    if (typeVal !== 'all') {
      typeMatch = ad.adCategory === typeVal;
    }
    
    return searchMatch && statusMatch && typeMatch;
  });
  
  // 2. Sort
  filteredCampaigns.sort((a, b) => {
    if (sortVal === 'date-desc') {
      // Newest start date first
      const dateA = a.startDate ? new Date(a.startDate) : new Date(0);
      const dateB = b.startDate ? new Date(b.startDate) : new Date(0);
      return dateB - dateA;
    } else if (sortVal === 'date-asc') {
      // Oldest start date first
      const dateA = a.startDate ? new Date(a.startDate) : new Date(8640000000000000);
      const dateB = b.startDate ? new Date(b.startDate) : new Date(8640000000000000);
      return dateA - dateB;
    } else if (sortVal === 'days-desc') {
      // Most running days first
      return b.runDays - a.runDays;
    } else if (sortVal === 'days-asc') {
      // Least running days first
      return a.runDays - b.runDays;
    }
    return 0;
  });
  
  // 3. Render based on view mode
  if (currentView === 'card') {
    campaignsContainer.classList.remove('hidden');
    campaignsTableContainer.classList.add('hidden');
    renderCampaigns(filteredCampaigns);
  } else {
    campaignsContainer.classList.add('hidden');
    campaignsTableContainer.classList.remove('hidden');
    renderTable(filteredCampaigns);
  }
}

// Filter listeners
filterSearch.addEventListener('input', applyFiltersAndSort);
filterStatus.addEventListener('change', applyFiltersAndSort);
filterType.addEventListener('change', applyFiltersAndSort);
sortBy.addEventListener('change', applyFiltersAndSort);

// View Mode Buttons listeners
btnViewCard.addEventListener('click', () => {
  currentView = 'card';
  btnViewCard.classList.add('active');
  btnViewTable.classList.remove('active');
  applyFiltersAndSort();
});

btnViewTable.addEventListener('click', () => {
  currentView = 'table';
  btnViewCard.classList.remove('active');
  btnViewTable.classList.add('active');
  applyFiltersAndSort();
});

// Excel Export Listener (uses SheetJS)
btnExportCsv.addEventListener('click', () => {
  if (filteredCampaigns.length === 0) {
    alert('Không có dữ liệu chiến dịch để xuất file!');
    return;
  }
  
  // Mảng dữ liệu cho Excel
  const excelData = [];
  
  filteredCampaigns.forEach((ad, index) => {
    excelData.push({
      'STT': index + 1,
      'Tên chiến dịch/Quảng cáo': ad.projectName,
      'Nội dung mô tả': ad.description || '',
      'Domain phân phối': ad.domain,
      'Định dạng quảng cáo': ad.adCategory,
      'Trạng thái': ad.status,
      'Ngày bắt đầu': formatDate(ad.startDate, false),
      'Ngày kết thúc': formatDate(ad.endDate, true),
      'Số ngày chạy': ad.runDays,
      'Link mẫu quảng cáo': ad.adLibraryPreviewUrl,
      'Link Landing Page': ad.landingPageUrl || ''
    });
  });

  // Tạo Worksheet và Workbook
  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Danh sách chiến dịch");

  // Định dạng độ rộng cột (Column widths)
  const wscols = [
    {wch: 5},   // STT
    {wch: 40},  // Tên chiến dịch
    {wch: 50},  // Nội dung mô tả
    {wch: 25},  // Domain
    {wch: 20},  // Định dạng
    {wch: 15},  // Trạng thái
    {wch: 15},  // Ngày BĐ
    {wch: 15},  // Ngày KT
    {wch: 15},  // Số ngày
    {wch: 40},  // Link mẫu QC
    {wch: 40}   // Link Landing
  ];
  worksheet['!cols'] = wscols;

  const advNameClean = advertiserData ? advertiserData.advertiserName.replace(/[^a-zA-Z0-9]/g, '_') : 'Advertiser';
  const filename = `MSAds_Spy_${advNameClean}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  
  // Xuất file XLSX
  XLSX.writeFile(workbook, filename);
});

// Image Lightbox Functions
window.openLightbox = function(url, caption) {
  lightboxImg.src = url;
  lightboxCaption.textContent = caption || '';
  lightbox.style.display = 'flex';
};

lightboxClose.addEventListener('click', () => {
  lightbox.style.display = 'none';
});

// Close lightbox when clicking outside the image
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) {
    lightbox.style.display = 'none';
  }
});
