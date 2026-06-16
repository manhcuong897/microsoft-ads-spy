# Công Cụ Do Thám Quảng Cáo Microsoft Ads (MS Ads Spy Tool)

Hệ thống do thám và phân tích chiến dịch quảng cáo đối thủ chạy trên nền tảng Microsoft Ads (Bing Ads). 

## 🌟 Các Tính Năng Nổi Bật
* **Xác thực mã nhà quảng cáo (Advertiser ID)**: Kiểm tra trạng thái tồn tại và thông tin chi tiết của nhà quảng cáo.
* **Quét toàn bộ chiến dịch quảng cáo**: Lấy dữ liệu chiến dịch bao gồm tên, mô tả quảng cáo, tên miền (domain) đích.
* **Thông tin thời gian thực tế**: Hiển thị chính xác ngày bắt đầu chạy, ngày kết thúc và số ngày chạy lũy kế.
* **Phân loại định dạng quảng cáo**: Tự động nhận diện quảng cáo dạng Tìm kiếm (Text), Hình ảnh (Image), hay Video.
* **Hiển thị trực quan (Visual Showcase)**: Hiển thị hình ảnh mẫu quảng cáo trực tiếp trên card và hỗ trợ xem phóng to (lightbox modal).
* **Bộ lọc và Sắp xếp thông minh**: Tìm kiếm quảng cáo, lọc theo định dạng, lọc theo trạng thái và sắp xếp theo ngày/số ngày chạy.

## 🚀 Hướng Dẫn Chạy Dự Án

### Bước 1: Mở thư mục dự án
Bạn nên mở thư mục `d:\Tool\microsoft-ads-spy` làm không gian làm việc (active workspace) của bạn.

### Bước 2: Chạy máy chủ (Server)
Mở terminal tại thư mục dự án và khởi chạy lệnh sau để bật máy chủ Node.js:

```bash
npm start
```

### Bước 3: Truy cập vào công cụ
Mở trình duyệt và truy cập địa chỉ:
👉 **[http://localhost:3030](http://localhost:3030)**

## 💡 Hướng dẫn lấy ID nhà quảng cáo để thử nghiệm
1. Truy cập [Microsoft Ad Library](https://adlibrary.ads.microsoft.com).
2. Nhập một thương hiệu lớn (Ví dụ: `Nike`, `Amazon`, `Samsung` hoặc `Adidas`).
3. Nhấp vào kết quả hiển thị để xem tất cả quảng cáo của họ.
4. Trên thanh địa chỉ URL, tìm tham số `advertiserId=...` (Ví dụ: `4295000966` đối với Nike EMEA).
5. Copy mã số này và dán vào thanh tìm kiếm của Spy Tool.
