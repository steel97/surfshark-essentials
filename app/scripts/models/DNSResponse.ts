export interface DNSAnswer {
    name: string,
    type: number,
    TTL: number,
    data: string
}

export interface DNSResponse {
    Answer: Array<DNSAnswer>
}