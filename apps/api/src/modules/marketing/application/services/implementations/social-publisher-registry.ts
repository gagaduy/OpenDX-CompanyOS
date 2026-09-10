// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  PublicationExecutionMode,
  SocialPlatform,
} from "../../../domain/entities/marketing-campaign";
import type { SocialPublisherPort } from "../../ports/social-publisher.port";

export class SocialPublisherRegistry {
  private readonly adapters = new Map<string, SocialPublisherPort>();

  register(adapter: SocialPublisherPort): this {
    const key = this.getKey(adapter.platform, adapter.executionMode);
    this.adapters.set(key, adapter);
    return this;
  }

  resolve(platform: SocialPlatform, executionMode: PublicationExecutionMode): SocialPublisherPort {
    const key = this.getKey(platform, executionMode);
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new Error(`No social publisher registered for platform '${platform}' and mode '${executionMode}'.`);
    }
    return adapter;
  }

  has(platform: SocialPlatform, executionMode: PublicationExecutionMode): boolean {
    const key = this.getKey(platform, executionMode);
    return this.adapters.has(key);
  }

  private getKey(platform: SocialPlatform, executionMode: PublicationExecutionMode): string {
    return `${platform}:${executionMode}`;
  }
}
