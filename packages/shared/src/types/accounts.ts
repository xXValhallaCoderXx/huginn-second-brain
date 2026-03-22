export interface Account {
    id: string;
    googleSub: string;
    email: string;
    displayName?: string;
    createdAt: Date;
}

export interface ChannelLink {
    accountId: string;
    provider: "telegram";
    providerUserId: string;
    linkedAt: Date;
}

export interface AccountService {
    createAccount(googleSub: string, email: string, displayName?: string): Promise<Account>;
    getAccountByGoogleSub(googleSub: string): Promise<Account | null>;
    getAccountById(id: string): Promise<Account | null>;

    linkChannel(
        accountId: string,
        provider: "telegram",
        providerUserId: string,
    ): Promise<ChannelLink>;
    unlinkChannel(accountId: string, provider: "telegram"): Promise<void>;
    resolveAccountFromChannel(
        provider: "telegram",
        providerUserId: string,
    ): Promise<Account | null>;
    getChannelLinks(accountId: string): Promise<ChannelLink[]>;

    createLinkingCode(accountId: string, provider: "telegram"): Promise<string>;
    verifyLinkingCode(code: string): Promise<{ accountId: string; provider: string } | null>;
}
