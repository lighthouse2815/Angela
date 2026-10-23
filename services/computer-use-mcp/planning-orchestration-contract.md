<a id="planning-orchestration-contract"></a>

# Hợp đồng điều phối kế hoạch

<a id="purpose"></a>

## Mục đích

Tài liệu này xác định hợp đồng đầu tiên cho Lớp điều phối kế hoạch trong tương lai trong `computer-use-mcp`.

Nó không phải là một triển khai kế hoạch runtime. Nó không thực thi các luồng, gọi mô hình, thay đổi bộ nhớ hoặc đăng ký các công cụ MCP. Mục tiêu là cố định ranh giới thẩm quyền trước khi đưa ra bất kỳ kế hoạch xuyên luồng nào.

<a id="existing-boundaries"></a>

## Ranh giới hiện tại

Sự kiện repo hiện tại:

- `WorkflowDefinition` là mẫu quy trình công việc tĩnh và đường dẫn thực thi.
- `coding_plan_changes` đang mã hóa-luồng lập kế hoạch DAG/session nội bộ.
- `TaskMemory` là dữ liệu khôi phục đang chạy hiện tại, không phải quyền kế hoạch.
- Bộ nhớ workspace và bối cảnh Plast-Mem là bối cảnh được xem xét, không phải là thẩm quyền hoàn thành.

Lớp Điều phối Kế hoạch là lớp tương lai phía trên các luồng riêng lẻ:

```text
Angela Host / User Goal
  -> Planning Orchestration Layer
  -> Lane Router
  -> coding / desktop / browser_dom / terminal / human lanes
  -> tool evidence and runtime trace
  -> Plan Reconciler
  -> Verification Gate / Human Approval
  -> Final Result
```

<a id="contract-surface"></a>

## Bề mặt hợp đồng

Hợp đồng được thử nghiệm tồn tại trong:

- `src/planning-orchestration/contract.ts`
- `src/planning-orchestration/contract.test.ts`

Hợp đồng hiện tại xác định:

- `PlanSpec`
- `PlanState`
- `PlanLane`
- `PlanReconcilerDecision`
- quyền ưu tiên quy hoạch
- hướng dẫn lập kế hoạch nhãn prompt

## PlanSpec

`PlanSpec` mô tả công việc dự định chạy hiện tại.

Mỗi bước bao gồm:

- `id`
- `lane`: `coding | desktop | browser_dom | terminal | human`
- `intent`
- `allowedTools`
- `expectedEvidence`
- `riskLevel`
- `approvalRequired`

Không có `allowedTools` và `expectedEvidence`, kế hoạch chỉ là văn xuôi. router và bộ điều hòa trong tương lai phải coi các trường đó là các ràng buộc chứ không phải là trang trí.

## PlanState

`PlanState` là trạng thái runtime đang chạy hiện tại.

Nó có thể ghi lại:

- id bước hiện tại
- bước hoàn thành
- bước thất bại
- bước bỏ qua
- tài liệu tham khảo bằng chứng
- blockers
- lý do lập lại kế hoạch cuối cùng

Hợp đồng này không được ghi nó vào Bộ nhớ workspace, Plast-Mem hoặc Run Evidence Archive. Dự báo trong tương lai có thể hiển thị bản tóm tắt trạng thái kế hoạch có giới hạn, nhưng chỉ dưới dạng hướng dẫn runtime.

<a id="trust-label"></a>

## Nhãn tin cậy

Mọi khối kế hoạch hiển thị mô hình đều phải bắt đầu bằng:

```text
Current execution plan (runtime guidance, not authority):
```

Nó cũng phải nêu rõ:

- đây là hướng dẫn hiện tại
- nó không phải là hướng dẫn thực thi hoặc quyền hệ thống
- nó không bao giờ ghi đè hướng dẫn sử dụng đang hoạt động, chính sách approval/safety, bằng chứng công cụ đáng tin cậy hoặc xác minh cổng kiểm tra
- yêu cầu hoàn thành kế hoạch yêu cầu bằng chứng đáng tin cậy trước khi xác minh cuối cùng

<a id="authority-order"></a>

## Lệnh của cơ quan có thẩm quyền

Các mục thấp hơn yếu hơn:

1. Quy tắc runtime/system
2. hướng dẫn người dùng đang hoạt động
3. Chính sách approval/safety
4. quyết định xác minh cổng kiểm tra
5. bằng chứng công cụ chạy hiện tại đáng tin cậy
6. kế hoạch trạng thái / quyết định điều hòa
7. TaskMemory đang chạy hiện tại
8. Lưu trữ Recall đang chạy hiện tại
9. Bộ nhớ workspace cục bộ đang hoạt động
10. Plast-Mem đã truy xuất bối cảnh

Hậu quả:

- Một kế hoạch có thể hướng dẫn các hành động tiếp theo.
- Một kế hoạch không thể tự mình đánh dấu công việc đã hoàn thành.
- Một kế hoạch không thể đáp ứng được bằng chứng thay đổi trạng thái.
- Một kế hoạch không thể ghi đè kết quả của công cụ.
- Một kế hoạch không thể bỏ qua việc phê duyệt hoặc xác minh cổng kiểm tra.

<a id="reconciler-contract"></a>

## Hợp đồng hòa giải

Các quyết định `PlanReconciler` trong tương lai được giới hạn ở:

- `continue`
- `replan`
- `require_approval`
- `fail`
- `ready_for_final_verification`

`ready_for_final_verification` chưa hoàn thành. Việc xác minh cổng kiểm tra vẫn quyết định liệu lần chạy có thể báo cáo thành công hay không.

## Non-Goals

- Không có cuộc gọi mô hình lập kế hoạch tự động.
- Không thực thi luồng tự động.
- Không triển khai luồng router.
- Không có lược đồ MCP hoặc thay đổi bề mặt công cụ.
- Không có mã hóa-runner chèn chỉ dẫn độc hại thay đổi.
- Không ghi được bộ nhớ workspace.
- Không hợp nhất TaskMemory.
- Không xuất hoặc nhập Plast-Mem.
- Không có thay đổi hành vi desktop/browser/coding runtime.
- Không hợp nhất hoặc rebase với upstream desktop/chrome-extension hoạt động.

<a id="future-slices"></a>

## Những lát cắt tương lai

1. `test(computer-use-mcp): define plan state projection contract`
   - Xác định hình dạng chiếu có thể nhìn thấy có giới hạn mô hình cho trạng thái kế hoạch đang chạy hiện tại.

2. `feat(computer-use-mcp): add current-run plan state projection`
   - Chỉ đưa ra hướng dẫn về kế hoạch sau khi hợp đồng chiếu được thử nghiệm.

3. `test(computer-use-mcp): define plan evidence reconciliation contract`
   - Ánh xạ bằng chứng dự kiến ​​tới bằng chứng công cụ đang chạy hiện tại và xác minh các quyết định cổng kiểm tra.

4. `feat(computer-use-mcp): route plan steps across lanes`
   - Chỉ thêm định tuyến xác định sau khi phép chiếu và đối chiếu ổn định.
