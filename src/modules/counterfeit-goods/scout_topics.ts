import type { DiscoveryTopic } from "../../types/candidate.js";

/**
 * 위조상품 모듈의 탐색 주제 + 시드 키워드.
 *
 * 주의:
 * - 본 키워드는 위조상품 의심 후보를 찾기 위한 검색 시드다.
 * - 위조상품 구매를 유도하기 위한 UI 문구가 아니다.
 * - 권리자/관계기관 판단을 대체하지 않으며, 최종 신고 여부는 사람이 판단한다.
 * - 비공개 채팅방/판매자 개인정보 추적 등은 수행하지 않는다.
 */
export const counterfeitTopics: DiscoveryTopic[] = [
  {
    id: "luxury_bag",
    label: "명품 가방",
    description: "명품 가방 위조상품 의심 게시글 탐색 시드",
    seedKeywords: [
      "명품 레플리카 가방",
      "미러급 가방",
      "1:1 가방",
      "풀박스 명품 가방",
      "정품급 가방"
    ]
  },
  {
    id: "luxury_watch",
    label: "명품 시계",
    description: "명품 시계 위조상품 의심 게시글 탐색 시드",
    seedKeywords: [
      "미러급 시계",
      "레플리카 시계",
      "1:1 시계",
      "풀박스 시계",
      "롤렉스 미러급"
    ]
  },
  {
    id: "shoes",
    label: "운동화",
    description: "운동화 위조상품 의심 게시글 탐색 시드",
    seedKeywords: [
      "정품급 운동화",
      "레플 운동화",
      "공장판 운동화",
      "한정판 운동화 레플",
      "나이키 정품급"
    ]
  },
  {
    id: "apparel",
    label: "의류",
    description: "의류 위조상품 의심 게시글 탐색 시드",
    seedKeywords: [
      "명품 의류 레플리카",
      "브랜드 티셔츠 1:1",
      "자체제작 로고 티셔츠",
      "명품 후드 레플"
    ]
  },
  {
    id: "cosmetics",
    label: "화장품",
    description: "화장품 위조상품 의심 게시글 탐색 시드",
    seedKeywords: [
      "정품급 화장품",
      "샘플 명품 화장품",
      "공장판 화장품"
    ]
  },
  {
    id: "electronics_accessory",
    label: "전자기기 액세서리",
    description: "전자기기 액세서리 위조상품 의심 게시글 탐색 시드",
    seedKeywords: [
      "정품급 이어폰",
      "1:1 이어폰",
      "공장판 충전기",
      "미러급 케이스"
    ]
  },
  {
    id: "golf",
    label: "골프용품",
    description: "골프용품 위조상품 의심 게시글 탐색 시드",
    seedKeywords: [
      "정품급 골프채",
      "골프 드라이버 1:1",
      "미러급 골프채"
    ]
  },
  {
    id: "streetwear",
    label: "스트리트웨어",
    description: "스트리트웨어 위조상품 의심 게시글 탐색 시드",
    seedKeywords: [
      "스트리트 브랜드 레플리카",
      "한정판 스트리트웨어 1:1",
      "공장판 스니커즈"
    ]
  }
];

export function getCounterfeitTopicById(id: string): DiscoveryTopic | undefined {
  return counterfeitTopics.find((t) => t.id === id || t.label === id);
}
