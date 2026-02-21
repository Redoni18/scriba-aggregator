import { Source } from '../generated/prisma/client'
import { WordpressAdapter } from './wordpress.adapter'

enum ApiType {
    WORDPRESS = 'wordpress',
}

export const createAdapter = (source: Source) => {
    switch (source.apiType) {
        case ApiType.WORDPRESS:
            return new WordpressAdapter(source)
        default:
            throw new Error(`Unsupported API type: ${source.apiType as string}`)
    }
}