import type { StoryClerkUser } from "../mocks/types";

export const adaStoryUser = {
  id: "user_story_ada",
  firstName: "Ada",
  lastName: "Lovelace",
  fullName: "Ada Lovelace",
  primaryEmailAddress: {
    emailAddress: "ada@storybook.test",
  },
} satisfies StoryClerkUser;
