export const PAGE_SIZE_CHECKLIST = [
  "Play Console > App bundle explorer > memory page size",
  "Local check: zipalign -c -P 16 -v 4 app.apk",
  "Build with NDK r28+ and Android Gradle Plugin 8.5.1+",
  "Run check_elf_alignment.sh on native libraries",
  "check Play Console for your app's deadline",
] as const;

export const PAGE_SIZE_NOTE =
  "The Play Developer API does not expose memory page size or ELF alignment. This is a best-effort report of the latest version codes plus a manual checklist.";
