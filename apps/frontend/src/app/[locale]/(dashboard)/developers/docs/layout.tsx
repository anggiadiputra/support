interface Props {
  children: React.ReactNode
}

export default function DocsLayout({ children }: Props) {
  return (
    <div
      data-layout="fixed"
      className="-m-4 flex h-[calc(100svh-4rem)] flex-col overflow-hidden"
    >
      {children}
    </div>
  )
}
