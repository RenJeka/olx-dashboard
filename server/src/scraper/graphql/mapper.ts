import type { RawListing } from '../../types.js';
import type { GraphqlListing } from './types.js';

export class GraphqlListingMapper {
  /** 
   * Відповідає за мапінг сирих даних GraphQL API (GraphqlListing) 
   * у доменну модель оголошення (RawListing). 
   * Не має жодних зовнішніх залежностей і побічних ефектів.
   */
  mapListing(item: GraphqlListing): RawListing {
    const { price, currency, params } = this.parseListingParams(item.params);
    const { photoUrl, photoUrls } = this.parseListingPhotos(item.photos);

    return {
      olxId: item.id,
      title: item.title,
      rawPrice: '',
      url: item.url,
      photoUrl,
      photoUrls,
      price,
      currency,
      createdAt: item.created_time,
      lastRefreshAt: item.last_refresh_time,
      city: item.location?.city?.name,
      district: item.location?.district?.name,
      categoryId: item.category?.id ?? null,
      categoryType: item.category?.type ?? null,
      sellerType: item.business ? 'business' : 'private',
      params,
      description: item.description ?? undefined,
      sellerName: item.user?.name ?? undefined,
      contactName: item.contact?.name ?? undefined,
      olxStatus: item.status,
    };
  }

  /**
   * Розбирає параметри оголошення (ціна, валюта та інші кастомні поля).
   * Витягує ціну з поля `PriceParam`.
   */
  private parseListingParams(itemParams: GraphqlListing['params']) {
    let price: number | null = null;
    let currency = 'UAH';
    const params: Record<string, string> = {};

    for (const param of itemParams ?? []) {
      if (param.key === 'price' && param.value.__typename === 'PriceParam') {
        price = param.value.value ?? null;
        currency = param.value.currency ?? 'UAH';
        continue;
      }

      const label = param.value.label ?? param.value.key;
      if (label != null) {
        params[param.key] = label;
      }
    }

    return { price, currency, params };
  }

  private parseListingPhotos(photos: GraphqlListing['photos']) {
    const rawPhoto = photos?.[0]?.link;
    const photoUrl = rawPhoto?.replace('{width}x{height}', '400x300');
    // Усі фото у прев'ю-розмірі для галереї при наведенні (більший за мініатюру).
    const photoUrls = (photos ?? [])
      .map((p) => p.link?.replace('{width}x{height}', '600x450'))
      .filter((link): link is string => Boolean(link));

    return { photoUrl, photoUrls };
  }
}
