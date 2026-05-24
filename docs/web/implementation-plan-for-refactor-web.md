Frontend Architecture Refactoring Plan
Mục tiêu: Cấu trúc lại toàn bộ mã nguồn Frontend (apps/web) theo đúng chuẩn Next.js App Router (phân tách Server/Client Component), áp dụng các thư viện quản lý state và data fetching hiện đại (Zustand, React Query, Zod), làm sạch code rác, và tạo ra một bộ khung (Repository Pattern) dễ bảo trì, tránh tình trạng "xôi đỗ" giữa code Demo và API.

User Review Required
WARNING

Kế hoạch này sẽ thay đổi lớn đến cấu trúc file trong apps/web/src. Tất cả comment hiện có trong code sẽ được giữ nguyên theo yêu cầu của bạn. Bạn vui lòng xem xét các thay đổi về file và pattern dưới đây.

Open Questions
IMPORTANT

Hiện tại thư mục packages có một số packages không dùng (constants, session, shared-types, storage, ui). Kế hoạch sẽ xóa hoàn toàn các thư mục này và gỡ bỏ khỏi package.json. Bạn có đồng ý xóa hẳn hay muốn giữ lại cho tương lai?
Về HTTP Cookie: Hiện tại token được lưu ở cả localStorage và Cookie (Lax). Chúng ta sẽ chuyển trọng tâm sang chỉ dùng Cookie cho auth, và dùng Zustand để lưu state của Demo Mode.
Proposed Changes
1. Dọn dẹp Packages không sử dụng (Root Level)
Xóa các thư mục không còn dùng đến và gỡ dependencies khỏi các app.

[DELETE] packages/constants
[DELETE] packages/session
[DELETE] packages/shared-types
[DELETE] packages/storage
[DELETE] packages/ui
[MODIFY] 
package.json (web)
[MODIFY] 
package.json (mobile)
2. Cấu hình & Tiện ích cốt lõi (Core Libs & Auth)
Chuyển đổi hoàn toàn cơ chế Auth sang dùng Cookie thay vì mix giữa LocalStorage và Cookie. Tích hợp Zod để validate môi trường và dữ liệu.

[MODIFY] 
apps/web/src/lib/auth.ts
Thay đổi cơ chế lấy và lưu session hoàn toàn dựa vào Cookie (thông qua js-cookie hoặc thao tác trực tiếp document.cookie). Xóa các đoạn dùng localStorage.setItem cho auth.
[MODIFY] 
apps/web/src/lib/api.ts
Wrapper apiFetch sẽ tự động lấy token từ Cookie để đính kèm vào Header.
3. State Management (Zustand) & Validation (Zod)
Thay thế các object local storage thuần túy bằng Zustand kết hợp persist middleware. Tạo thư mục schemas chứa Zod để validate dữ liệu đầu vào/ra.

[NEW] apps/web/src/schemas/sourcing.ts
Định nghĩa Zod schemas: ProductSchema, RfqSchema, QuotationSchema.
[MODIFY] 
apps/web/src/lib/workflow-store.ts
Refactor sử dụng create từ zustand và persist.
[MODIFY] 
apps/web/src/lib/order-store.ts
Refactor sử dụng zustand và persist.
4. Data Fetching & Services (Repository Pattern)
Tách biệt logic gọi API và logic Mock/Demo bằng Custom Hooks sử dụng @tanstack/react-query. Giao diện (UI Components) sẽ chỉ gọi Hook và không quan tâm đến demoEnabled.

[NEW] apps/web/src/services/queries/useSourcingQueries.ts
Implement useProducts hook. Sử dụng isDemoWorkspaceSession().
Nếu true: Trả về dữ liệu từ file mock.
Nếu false: Sử dụng React Query (useQuery) gọi API /products/search và validate qua Zod.
Implement useRfqs và useQuotations hooks.
[NEW] apps/web/src/services/mutations/useSourcingMutations.ts
Implement useSubmitRfq và useSelectQuotation với useMutation từ React Query. Cập nhật Zustand (nếu Demo) hoặc gửi API (nếu Real API).
5. Tái cấu trúc Giao diện (SSR & CSR Separation)
Áp dụng đúng Next.js Pattern: Page lớn sẽ là Server Component (SSR), các phần tương tác nhỏ sẽ là Client Component ("use client").

[MODIFY] 
apps/web/src/app/buyer/sourcing/page.tsx
Gỡ bỏ "use client".
Trở thành Server Component cơ bản làm layout/container.
Import và render <SourcingDashboardClient />.
[NEW] apps/web/src/app/buyer/sourcing/components/SourcingDashboardClient.tsx
Đặt "use client". Quản lý Tabs và Layout tổng thể của trang Sourcing.
[NEW] apps/web/src/app/buyer/sourcing/components/ProductSearchTab.tsx
Component quản lý việc tìm kiếm sản phẩm. Sử dụng useProducts hook.
[NEW] apps/web/src/app/buyer/sourcing/components/RfqCompareTab.tsx
Component quản lý tab so sánh RFQ. Sử dụng useRfqs hook.
(Việc tách component tương tự cũng sẽ được áp dụng dần cho các trang phức tạp khác như carrier/fleet, supplier/catalog nếu cần, nhưng sẽ tập trung làm chuẩn template ở buyer/sourcing trước).

6. Documentation
Viết tài liệu hướng dẫn chuẩn chỉ cho team.

[NEW] apps/web/README.md
Tổng hợp lại các thay đổi sau khi refactor (những file bị di dời, cơ chế mới).
[NEW] apps/web/README_DEVELOPMENT_GUIDELINES.md
Viết Guidelines cho việc dev:
Khi nào dùng "use client" vs Server Components.
Cách dùng Repository Pattern với React Query.
Cách dùng Zustand để lưu Global State.
Quy tắc quản lý form và validate với Zod.
Verification Plan
Automated Tests
Kiểm tra pnpm build hoặc next build trong apps/web để đảm bảo không bị lỗi syntax, imports, type.
Manual Verification
Chạy npm run dev.
Đăng nhập vào 1 tài khoản demo-buyer để xác minh luồng Demo vẫn chạy ổn định qua Zustand/Mock.
Đăng nhập vào 1 tài khoản Real API để xác minh React Query gửi request qua HTTP thành công.
Xác nhận các Cookie access_token được truyền tải chính xác qua middleware.
