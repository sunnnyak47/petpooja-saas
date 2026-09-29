-- CreateTable
CREATE TABLE "push_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "outlet_id" UUID,
    "platform" VARCHAR(20) NOT NULL DEFAULT 'unknown',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens"("user_id");

-- CreateIndex
CREATE INDEX "push_tokens_outlet_id_idx" ON "push_tokens"("outlet_id");

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

