ALTER TABLE "tools" RENAME COLUMN "agent_id" TO "source_agent_id";--> statement-breakpoint
ALTER TABLE "tools" DROP CONSTRAINT "tools_catalog_id_name_agent_id_prompt_agent_id_unique";--> statement-breakpoint
ALTER TABLE "tools" DROP CONSTRAINT "tools_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_source_agent_id_agents_id_fk" FOREIGN KEY ("source_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_catalog_id_name_source_agent_id_prompt_agent_id_unique" UNIQUE("catalog_id","name","source_agent_id","prompt_agent_id");