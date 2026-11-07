# ĐẤU TRƯỜNG TRI THỨC – THCS TRẦN HƯNG ĐẠO

**Bản quyền giao diện/chương trình: Cô Nguyễn Cẩm Linh – THCS Trần Hưng Đạo.**

Bộ mã nguồn gồm:
- `index.html`: giao diện học sinh + bảng điều khiển giáo viên, responsive.
- `Code.gs`: API Google Apps Script, đồng bộ phiên thi và lưu Google Sheets.
- `appsscript.json`: cấu hình Apps Script.
- `CAU_HOI_MAU.csv`: mẫu 6 câu hỏi.

## 1. Mô hình hoạt động

GitHub Pages phục vụ giao diện. Google Apps Script làm máy chủ điều phối và Google Sheets lưu dữ liệu. Máy học sinh và máy giáo viên đều truy cập cùng một URL GitHub Pages; giáo viên vào nút **Giáo viên** và nhập mã quản trị.

Mỗi phiên có tối đa 24 thí sinh. Giáo viên có thể bắt đầu với ít hơn 24 người, nhưng cần duyệt ít nhất một người. Sáu câu hỏi chạy theo đồng hồ máy chủ, 30 giây/câu, tổng 180 giây. Máy chủ xác định câu hỏi hiện hành và thời điểm hết giờ; không tin đồng hồ máy học sinh.

## 2. Tạo Google Sheet

1. Tạo một Google Spreadsheet mới.
2. Sao chép ID nằm giữa `/d/` và `/edit` trong URL.
3. Mở **Extensions → Apps Script**.
4. Mở `Code.gs` trong gói này, sao chép toàn bộ nội dung vào trình soạn thảo Apps Script.
5. Vào **Project Settings → Script Properties**, thêm:
   - `SPREADSHEET_ID` = ID Google Sheet vừa tạo.
   - `ADMIN_PIN` = mật khẩu quản trị dài, khó đoán (khuyến nghị ít nhất 12 ký tự).
6. Lưu dự án.
7. Chọn hàm `setup` và bấm **Run**; cấp quyền truy cập Google Sheets.
8. Mở Google Sheet. Trong tab `CAU_HOI`, thay 6 câu hỏi mẫu. Cột G nhập đáp án đúng bằng chữ `A`, `B`, `C` hoặc `D`. Giữ đúng 6 dòng câu hỏi và điền đủ 4 phương án.

Các tab dữ liệu được tạo tự động:
- `CAU_HOI`
- `HOC_SINH`
- `PHIEN_THI`
- `CHI_TIET`
- `KET_QUA`
- `LICH_SU`

## 3. Triển khai Apps Script thành Web App

1. Trong Apps Script chọn **Deploy → New deployment**.
2. Chọn loại **Web app**.
3. **Execute as:** Me.
4. **Who has access:** Anyone (hoặc lựa chọn phù hợp chính sách tài khoản trường).
5. Deploy, cấp quyền nếu được hỏi.
6. Sao chép URL kết thúc bằng `/exec`.

> Lưu ý: Apps Script Web App phải được triển khai cho phép người dùng truy cập. Không chia sẻ mã `ADMIN_PIN` cho học sinh. Không đưa ID Sheet, mật khẩu hoặc mã quản trị vào kho GitHub công khai. Nếu sửa `Code.gs`, cần cập nhật deployment (Deploy → Manage deployments → Edit → New version).

## 4. Cấu hình website

1. Mở `index.html`.
2. Tìm dòng:
   `const API_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";`
3. Thay phần trong dấu ngoặc kép bằng URL `/exec` vừa triển khai.
4. Tạo GitHub repository, ví dụ `dau-truong-tri-thuc`.
5. Đưa `index.html` lên thư mục gốc của repository.
6. Vào **Settings → Pages**.
7. Chọn **Deploy from a branch**, branch `main`, folder `/ (root)`, Save.
8. Chờ GitHub Pages xuất bản website và mở URL được cấp.

## 5. Quy trình sử dụng

### Trước cuộc thi
1. Giáo viên mở website, bấm **Giáo viên**.
2. Nhập `ADMIN_PIN` đã đặt trong Script Properties.
3. Bấm **Tạo phiên thi mới**.
4. Học sinh truy cập URL, nhập họ tên và lớp.
5. Giáo viên theo dõi danh sách và bấm **Duyệt** từng em hoặc **Xác nhận tất cả**.

### Bắt đầu
- Giáo viên bấm **Bắt đầu cuộc thi**.
- Hệ thống ghi thời điểm bắt đầu trên máy chủ.
- Các máy đã duyệt tự chuyển vào bài thi; câu hỏi hiện hành được đồng bộ theo đồng hồ máy chủ.
- Mỗi câu có 30 giây. Nếu học sinh không chọn, câu đó tính là không trả lời.

### Kết thúc và xếp hạng
- Hết 180 giây, học sinh được đánh dấu hoàn thành khi trình duyệt hỏi trạng thái máy chủ.
- Giáo viên có thể bấm **Kết thúc cuộc thi** để khóa sớm.
- Xếp hạng: số câu đúng giảm dần → thời gian làm bài tăng dần → thời điểm nộp sớm hơn.
- Giáo viên có thể tải CSV từ bảng xếp hạng. Dữ liệu gốc nằm trong Google Sheets.

## 6. Giới hạn và lưu ý vận hành

- Đây là bản nền tảng chạy được để triển khai thử nghiệm; nên chạy thử với 2–3 máy trước khi tổ chức chính thức.
- Apps Script có hạn mức thực thi và quota theo tài khoản Google. Với 24 máy, tần suất đồng bộ trong bản này được đặt khoảng 0,7–2,2 giây; hãy thử tải thực tế bằng tài khoản trường.
- Kết nối Internet bị gián đoạn có thể làm chậm cập nhật giao diện. Dữ liệu đáp án chỉ được tính khi máy chủ nhận được yêu cầu trong đúng khoảng thời gian của câu hỏi.
- Trình duyệt học sinh phải giữ tab cuộc thi mở. Nếu đóng tab hoặc mất mạng, các câu chưa gửi sẽ không có đáp án.
- Bản này không có giám sát màn hình, webcam hoặc khóa máy học sinh. Nó giám sát trạng thái tham gia và tiến độ làm bài ở mức ứng dụng.
- Với kỳ thi có yêu cầu chống gian lận cao, nên bổ sung tài khoản học sinh được cấp trước, mã tham gia riêng và kiểm thử bảo mật độc lập.
- Khi tổ chức thật, nên giới hạn quyền chia sẻ Google Sheet ở giáo viên; chỉ Apps Script cần quyền ghi dữ liệu.

## 7. Kiểm tra nhanh trước khi dùng

- [ ] `SPREADSHEET_ID` và `ADMIN_PIN` đã được đặt.
- [ ] Đã chạy `setup()`.
- [ ] Đã thay 6 câu hỏi mẫu, đủ 4 đáp án và đáp án đúng.
- [ ] Apps Script đã Deploy Web App và URL `/exec` hoạt động.
- [ ] `API_URL` trong `index.html` đã được thay đúng.
- [ ] GitHub Pages đã xuất bản.
- [ ] Đã thử đăng ký, duyệt, bắt đầu, trả lời, kết thúc và xem bảng xếp hạng trên nhiều máy.

**Bản quyền:** Cô Nguyễn Cẩm Linh – THCS Trần Hưng Đạo.
